#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <GL/glew.h>
#include <GL/gl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <math.h>

// Forward declaration
LRESULT CALLBACK RectWindowProc(HWND hwnd_, UINT uMsg, WPARAM wParam, LPARAM lParam);

// Globals
HWND r_hwnd; HDC r_hdc; HGLRC r_hglrc; GLuint r_prog; GLuint r_VAO, r_VBO;

// 4 rectangles positions (NDC)
typedef struct { float x, y; float vx, vy; bool dragging; } Body;
Body R[4];

// Sizes (NDC half-extents)
float rectHalfX = 0.18f, rectHalfY = 0.12f;

// Physics
const float r_dt = 0.016f;   // Time step (~60 FPS)
const float r_k = 0.8f;      // Softer spring constant
const float r_c = 1.5f;      // Stronger damping
const float r_pairK = 0.1f;  // Weaker repulsion between rectangles
const float r_pairC = 0.3f;  // Stronger damping between rectangles
float r_time = 0.0f;         // For time-based animations
float r_calm = 0.0f; const float r_calmThresh = 0.5f; const float r_velEps = 0.003f;

// Uniforms
GLint u_rect1, u_rect2, u_rect3, u_rect4, u_size, u_blendK, u_resolution;

static char* r_readFile(const char* path) {
    FILE* f = fopen(path, "rb"); if (!f) return NULL; fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    if (n <= 0) { fclose(f); return NULL; } char* b = (char*)malloc((size_t)n + 1); if (!b) { fclose(f); return NULL; }
    size_t r = fread(b, 1, (size_t)n, f); fclose(f); b[r] = '\0'; return b;
}

static GLuint r_compile(GLenum type, const char* src) {
    GLuint s = glCreateShader(type); glShaderSource(s, 1, &src, NULL); glCompileShader(s);
    GLint ok = 0; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) { char info[512]; glGetShaderInfoLog(s, 512, NULL, info); fprintf(stderr, "Shader compile failed: %s\n", info); }
    return s;
}

static GLuint r_makeProgram(const char* fragPath) {
    char* vsrc = r_readFile("modern_vertex.glsl");
    char* fsrc = r_readFile(fragPath ? fragPath : "rect_fragment.glsl");
    if (!vsrc || !fsrc) { if (vsrc) free(vsrc); if (fsrc) free(fsrc); return 0; }
    GLuint vs = r_compile(GL_VERTEX_SHADER, vsrc); GLuint fs = r_compile(GL_FRAGMENT_SHADER, fsrc);
    free(vsrc); free(fsrc);
    GLuint p = glCreateProgram(); glAttachShader(p, vs); glAttachShader(p, fs); glLinkProgram(p);
    GLint ok = 0; glGetProgramiv(p, GL_LINK_STATUS, &ok);
    if (!ok) { char info[512]; glGetProgramInfoLog(p, 512, NULL, info); fprintf(stderr, "Link failed: %s\n", info); }
    glDeleteShader(vs); glDeleteShader(fs); return p;
}

static bool r_setupGL(void) {
    GLenum e = glewInit(); if (e != GLEW_OK) { fprintf(stderr, "GLEW init failed: %s\n", glewGetErrorString(e)); return false; }
    // quad
    float verts[] = { -1.f,-1.f, 1.f,-1.f, 1.f,1.f, -1.f,1.f };
    glGenVertexArrays(1, &r_VAO); glGenBuffers(1, &r_VBO);
    glBindVertexArray(r_VAO); glBindBuffer(GL_ARRAY_BUFFER, r_VBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(verts), verts, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 2*sizeof(float), (void*)0); glEnableVertexAttribArray(0);
    glBindVertexArray(0);
    glEnable(GL_BLEND); glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    return true;
}

static bool r_pointInRect(float nx, float ny, float cx, float cy, float hx, float hy) {
    return fabsf(nx - cx) <= hx && fabsf(ny - cy) <= hy;
}

static void r_update(void) {
    // Update time for animations
    r_time += r_dt;
    
    // Check if any rectangle is being dragged
    bool any_dragging = R[0].dragging || R[1].dragging || R[2].dragging || R[3].dragging;
    
    // Update each rectangle's physics
    for (int i = 0; i < 4; ++i) {
        if (!R[i].dragging) {
            // Calculate distance from center
            float distFromCenter = sqrtf(R[i].x*R[i].x + R[i].y*R[i].y);
            
            // Very strong damping near center to prevent any bouncing
            float dynamicDamping = r_c;
            if (distFromCenter < 0.7f) {
                // Scale damping from 3.0 to 8.0 as we approach center
                dynamicDamping = 3.0f + (0.7f - distFromCenter) * 7.0f;
            }
            
            // Spring force toward center with dynamic damping
            float ax = -r_k * R[i].x - dynamicDamping * R[i].vx;
            float ay = -r_k * R[i].y - dynamicDamping * R[i].vy;
            
            // Rectangle-rectangle interactions (when not dragging)
            if (!any_dragging) {
                for (int j = 0; j < 4; ++j) {
                    if (i != j) {
                        float dx = R[i].x - R[j].x;
                        float dy = R[i].y - R[j].y;
                        float distSq = dx*dx + dy*dy;
                        
                        // Only apply minimal repulsion when very close
                        if (distSq < 0.05f) {
                            float dist = sqrtf(distSq);
                            float dvx = R[i].vx - R[j].vx;
                            float dvy = R[i].vy - R[j].vy;
                            
                            // Very strong damping when rectangles are close
                            float pairDamping = r_pairC * 3.0f;
                            // Very weak repulsion to prevent separation
                            float pair_ax = -r_pairK * 0.1f * dx - pairDamping * dvx;
                            float pair_ay = -r_pairK * 0.1f * dy - pairDamping * dvy;
                            
                            ax += pair_ax * 0.2f;
                            ay += pair_ay * 0.2f;
                        }
                    }
                }
            }
            
            // Update velocity and position
            R[i].vx += ax * r_dt;
            R[i].vy += ay * r_dt;
            R[i].x += R[i].vx * r_dt;
            R[i].y += R[i].vy * r_dt;
            
            // Velocity limiting - more aggressive when near center
            float speed = sqrtf(R[i].vx*R[i].vx + R[i].vy*R[i].vy);
            float maxSpeed = 1.0f;
            if (distFromCenter < 0.3f) {
                maxSpeed = 0.3f + distFromCenter * 2.33f; // Scale from 0.3 to 1.0
            }
            if (speed > maxSpeed) {
                R[i].vx = R[i].vx / speed * maxSpeed;
                R[i].vy = R[i].vy / speed * maxSpeed;
            }
            
            // Keep within bounds
            if (R[i].x < -0.95f) { R[i].x = -0.95f; R[i].vx = -R[i].vx * 0.5f; }
            if (R[i].x >  0.95f) { R[i].x =  0.95f; R[i].vx = -R[i].vx * 0.5f; }
            if (R[i].y < -0.95f) { R[i].y = -0.95f; R[i].vy = -R[i].vy * 0.5f; }
            if (R[i].y >  0.95f) { R[i].y =  0.95f; R[i].vy = -R[i].vy * 0.5f; }
        } else {
            R[i].vx = R[i].vy = 0.0f;  // Dragged rectangle has no velocity
        }
    }

    // Only reset when all rectangles are near center and not dragging
    if (!R[0].dragging && !R[1].dragging && !R[2].dragging && !R[3].dragging) {
        bool allCenter = true;
        bool slow = true;
        
        // Check if all rectangles are near center and moving slowly
        for (int i = 0; i < 4; ++i) {
            if (fabsf(R[i].x) > 0.1f || fabsf(R[i].y) > 0.1f) allCenter = false;
            if (sqrtf(R[i].vx*R[i].vx + R[i].vy*R[i].vy) >= 0.01f) slow = false;
        }
        
        // If all are centered and slow, gently move them to exact center
        if (allCenter && slow) {
            for (int i = 0; i < 4; ++i) {
                float distSq = R[i].x * R[i].x + R[i].y * R[i].y;
                
                // Stronger damping when near center
                if (distSq < 0.05f) {
                    // Critical damping when very close to center
                    R[i].vx *= 0.85f;
                    R[i].vy *= 0.85f;
                    
                    // Gently move to center
                    R[i].x *= 0.9f;
                    R[i].y *= 0.9f;
                } else {
                    // Normal movement when further away
                    R[i].x *= 0.95f;
                    R[i].y *= 0.95f;
                }
                
                // If very close to center, snap to center
                if (distSq < 0.0001f) {
                    R[i].x = R[i].y = 0.0f;
                    R[i].vx = R[i].vy = 0.0f;
                }
            }
        }
    }
}

static void r_render(void) {
    glClearColor(0.05f, 0.05f, 0.06f, 1.0f); glClear(GL_COLOR_BUFFER_BIT);
    glUseProgram(r_prog);

    // Positions to UV [0,1]
    float uvx[4], uvy[4];
    for (int i = 0; i < 4; ++i) { uvx[i] = R[i].x * 0.5f + 0.5f; uvy[i] = R[i].y * 0.5f + 0.5f; }
    glUniform2f(u_rect1, uvx[0], uvy[0]);
    glUniform2f(u_rect2, uvx[1], uvy[1]);
    glUniform2f(u_rect3, uvx[2], uvy[2]);
    glUniform2f(u_rect4, uvx[3], uvy[3]);
    glUniform2f(u_size, rectHalfX * 0.5f, rectHalfY * 0.5f); // NDC->UV scale
    if (u_blendK >= 0) glUniform1f(u_blendK, 0.28f);
    RECT rc; GetClientRect(r_hwnd, &rc);
    glUniform2f(u_resolution, (float)(rc.right - rc.left), (float)(rc.bottom - rc.top));

    glBindVertexArray(r_VAO); glDrawArrays(GL_TRIANGLE_FAN, 0, 4); glBindVertexArray(0);
    SwapBuffers(r_hdc);
}

static void r_updateDragFromMouse(int mx, int my) {
    RECT rc; GetClientRect(r_hwnd, &rc); float w = (float)(rc.right - rc.left), h = (float)(rc.bottom - rc.top);
    if (mx < 0) mx = 0; if (mx > (int)w - 1) mx = (int)w - 1; if (my < 0) my = 0; if (my > (int)h - 1) my = (int)h - 1;
    float nx = (mx) / w * 2.0f - 1.0f; float ny = 1.0f - (my) / h * 2.0f;
    // Keep dragging in NDC, but this matches rendering; picking space already adjusted
    for (int i = 0; i < 4; ++i) if (R[i].dragging) {
        R[i].x = fmaxf(-0.8f, fminf(0.8f, nx)); R[i].y = fmaxf(-0.8f, fminf(0.8f, ny));
    }
}

LRESULT CALLBACK RectWindowProc(HWND hwnd_, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
        case WM_PAINT: { PAINTSTRUCT ps; BeginPaint(hwnd_, &ps); r_render(); EndPaint(hwnd_, &ps); return 0; }
        case WM_LBUTTONDOWN: {
            int mx = GET_X_LPARAM(lParam), my = GET_Y_LPARAM(lParam);
            RECT rc; GetClientRect(hwnd_, &rc); float w = (float)(rc.right - rc.left), h = (float)(rc.bottom - rc.top);
            if (mx < 0) mx = 0; if (mx > (int)w - 1) mx = (int)w - 1; if (my < 0) my = 0; if (my > (int)h - 1) my = (int)h - 1;
            float nx = (mx) / w * 2.0f - 1.0f; float ny = 1.0f - (my) / h * 2.0f;
            // Match shader's aspect-scaled picking space
            float aspect = (w > 0 && h > 0) ? (w / h) : 1.0f;
            float sx = (nx * 0.5f + 0.5f) * aspect;
            float sy = (ny * 0.5f + 0.5f);
            bool grabbed = false;
            for (int i = 0; i < 4 && !grabbed; ++i) {
                float cx = (R[i].x * 0.5f + 0.5f) * aspect;
                float cy = (R[i].y * 0.5f + 0.5f);
                // Inflate half extents slightly for union rim grabbing
                float hx = (rectHalfX * 0.5f) * aspect + 0.015f;
                float hy = (rectHalfY * 0.5f) + 0.015f;
                if (fabsf(sx - cx) <= hx && fabsf(sy - cy) <= hy) { R[i].dragging = true; SetCapture(hwnd_); grabbed = true; }
            }
            return 0; }
        case WM_MOUSEMOVE: { if (R[0].dragging||R[1].dragging||R[2].dragging||R[3].dragging) { r_updateDragFromMouse(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)); InvalidateRect(hwnd_, NULL, FALSE);} return 0; }
        case WM_LBUTTONUP: { R[0].dragging=R[1].dragging=R[2].dragging=R[3].dragging=false; ReleaseCapture(); return 0; }
        case WM_TIMER: { r_update(); InvalidateRect(hwnd_, NULL, FALSE); return 0; }
        case WM_KEYDOWN: { if (wParam == VK_ESCAPE) { PostQuitMessage(0); } return 0; }
        case WM_DESTROY: { KillTimer(hwnd_, 1); PostQuitMessage(0); return 0; }
    }
    return DefWindowProc(hwnd_, uMsg, wParam, lParam);
}

int run_rectangles_animation(const char* fragmentPath) {
    // Window class
    WNDCLASSA wc; ZeroMemory(&wc, sizeof(wc)); wc.lpfnWndProc = RectWindowProc; wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = "RectOpenGLWindowC"; wc.hCursor = LoadCursor(NULL, IDC_ARROW); wc.hbrBackground = (HBRUSH)(COLOR_WINDOW+1);
    if (!RegisterClassA(&wc)) { fprintf(stderr, "RegisterClass failed\n"); return -1; }
    // Window
    r_hwnd = CreateWindowExA(0, "RectOpenGLWindowC", "Modern OpenGL Rectangles (C)", WS_OVERLAPPEDWINDOW,
                             CW_USEDEFAULT, CW_USEDEFAULT, 800, 600, NULL, NULL, GetModuleHandle(NULL), NULL);
    if (!r_hwnd) { fprintf(stderr, "CreateWindow failed\n"); return -1; }
    r_hdc = GetDC(r_hwnd);
    PIXELFORMATDESCRIPTOR pfd; ZeroMemory(&pfd, sizeof(pfd)); pfd.nSize = sizeof(pfd); pfd.nVersion = 1;
    pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER; pfd.iPixelType = PFD_TYPE_RGBA; pfd.cColorBits = 32; pfd.cDepthBits = 24; pfd.cStencilBits = 8;
    int pf = ChoosePixelFormat(r_hdc, &pfd); if (!pf || !SetPixelFormat(r_hdc, pf, &pfd)) { fprintf(stderr, "PixelFormat failed\n"); return -1; }
    r_hglrc = wglCreateContext(r_hdc); if (!r_hglrc || !wglMakeCurrent(r_hdc, r_hglrc)) { fprintf(stderr, "GL context failed\n"); return -1; }
    if (!r_setupGL()) { fprintf(stderr, "GL setup failed\n"); return -1; }

    r_prog = r_makeProgram(fragmentPath ? fragmentPath : "rect_fragment.glsl"); if (!r_prog) { fprintf(stderr, "Program failed\n"); return -1; }
    glUseProgram(r_prog);
    u_rect1 = glGetUniformLocation(r_prog, "rect1Pos");
    u_rect2 = glGetUniformLocation(r_prog, "rect2Pos");
    u_rect3 = glGetUniformLocation(r_prog, "rect3Pos");
    u_rect4 = glGetUniformLocation(r_prog, "rect4Pos");
    u_size = glGetUniformLocation(r_prog, "rectSize");
    u_blendK = glGetUniformLocation(r_prog, "blendK");
    u_resolution = glGetUniformLocation(r_prog, "resolution");

    printf("Uniform locations (rect): %d %d %d %d size=%d blendK=%d res=%d\n", u_rect1,u_rect2,u_rect3,u_rect4,u_size,u_blendK,u_resolution);

    // init positions from corners
    R[0].x = -0.7f; R[0].y = -0.7f; R[0].vx = R[0].vy = 0; R[0].dragging=false;
    R[1].x =  0.7f; R[1].y =  0.7f; R[1].vx = R[1].vy = 0; R[1].dragging=false;
    R[2].x = -0.7f; R[2].y =  0.7f; R[2].vx = R[2].vy = 0; R[2].dragging=false;
    R[3].x =  0.7f; R[3].y = -0.7f; R[3].vx = R[3].vy = 0; R[3].dragging=false;

    SetTimer(r_hwnd, 1, 16, NULL); ShowWindow(r_hwnd, SW_SHOW); UpdateWindow(r_hwnd);
    MSG msg; ZeroMemory(&msg, sizeof(msg)); while (GetMessage(&msg, NULL, 0, 0)) { TranslateMessage(&msg); DispatchMessage(&msg); }
    wglMakeCurrent(NULL, NULL); wglDeleteContext(r_hglrc); ReleaseDC(r_hwnd, r_hdc);
    return 0;
}

int main(int argc, char** argv) {
    // Launch rectangles animation. You can pass an alternate fragment path as arg.
    const char* frag = (argc > 1) ? argv[1] : "rect_fragment.glsl";
    return run_rectangles_animation(frag);
}


