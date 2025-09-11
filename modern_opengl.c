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

// Forward declaration of window procedure
LRESULT CALLBACK WindowProc(HWND hwnd_, UINT uMsg, WPARAM wParam, LPARAM lParam);

// Global variables
HWND hwnd;
HDC hdc;
HGLRC hglrc;
GLuint shaderProgram;
GLuint VAO, VBO;

// Circle positions and properties
float circle1X = -0.5f, circle1Y = 0.0f;
float circle2X =  0.5f, circle2Y = 0.0f;
// Remember initial positions for repeating the start animation
const float initialCircle1X = -0.5f, initialCircle1Y = 0.0f;
const float initialCircle2X =  0.5f, initialCircle2Y = 0.0f;
float circleRadius = 0.28f;
bool isDragging1 = false, isDragging2 = false;

// Animation/physics
float animationTime = 0.0f;
bool physicsActive = true;
float circle1VX = 0.0f, circle1VY = 0.0f;
float circle2VX = 0.0f, circle2VY = 0.0f;
const float springK = 1.0f;     // pull toward center
const float damping = 0.6f;     // lower damping for more wobble
const float pairSpringK = 0.30f;   // spring between circles
const float pairDamping = 0.10f;   // relative velocity damping
const float timeStep = 0.016f;  // ~60 FPS
// Calm/repeat control
float calmTimer = 0.0f;
const float calmThreshold = 0.5f;
const float velocityEps = 0.003f;
bool mergeKickArmed = true;
bool userInteracted = false; // only kick after user drag, not during timed repeat

// Helpers
static inline bool isNear(float a, float b, float eps) {
    return fabsf(a - b) <= eps;
}
static inline bool isAtCenter(float x, float y) {
    return (fabsf(x) <= 0.01f) && (fabsf(y) <= 0.01f);
}

// Uniform locations
GLint circle1PosLoc, circle2PosLoc, radiusLoc, resolutionLoc;
GLint blendKLoc;

// Read entire file to a null-terminated buffer; caller must free
static char* readFile(const char* path) {
    FILE* f = fopen(path, "rb");
    if (!f) {
        fprintf(stderr, "Failed to open file: %s\n", path);
        return NULL;
    }
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (len <= 0) { fclose(f); return NULL; }
    char* buf = (char*)malloc((size_t)len + 1);
    if (!buf) { fclose(f); return NULL; }
    size_t r = fread(buf, 1, (size_t)len, f);
    fclose(f);
    buf[r] = '\0';
    return buf;
}

static GLuint compileShader(GLenum type, const char* source) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, NULL);
    glCompileShader(shader);
    GLint ok = 0; glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char info[512];
        glGetShaderInfoLog(shader, 512, NULL, info);
        fprintf(stderr, "Shader compilation failed: %s\n", info);
    }
    return shader;
}

static GLuint createShaderProgram(const char* fragmentPath) {
    char* vertexSource = readFile("modern_vertex.glsl");
    char* fragmentSource = readFile(fragmentPath ? fragmentPath : "modern_fragment.glsl");
    if (!vertexSource || !fragmentSource) {
        if (vertexSource) free(vertexSource);
        if (fragmentSource) free(fragmentSource);
        return 0;
    }
    GLuint vs = compileShader(GL_VERTEX_SHADER, vertexSource);
    GLuint fs = compileShader(GL_FRAGMENT_SHADER, fragmentSource);
    free(vertexSource);
    free(fragmentSource);

    GLuint prog = glCreateProgram();
    glAttachShader(prog, vs);
    glAttachShader(prog, fs);
    glLinkProgram(prog);
    GLint ok = 0; glGetProgramiv(prog, GL_LINK_STATUS, &ok);
    if (!ok) {
        char info[512];
        glGetProgramInfoLog(prog, 512, NULL, info);
        fprintf(stderr, "Shader link failed: %s\n", info);
    }
    glDeleteShader(vs);
    glDeleteShader(fs);
    return prog;
}

static bool setupOpenGL(void) {
    GLenum e = glewInit();
    if (e != GLEW_OK) {
        fprintf(stderr, "GLEW init failed: %s\n", glewGetErrorString(e));
        return false;
    }
    // shaderProgram will be created later by run_circles_animation()

    // Uniforms will be fetched after shaders are compiled

    // Fullscreen quad
    float vertices[] = {
        -1.0f, -1.0f,
         1.0f, -1.0f,
         1.0f,  1.0f,
        -1.0f,  1.0f
    };

    glGenVertexArrays(1, &VAO);
    glGenBuffers(1, &VBO);
    glBindVertexArray(VAO);
    glBindBuffer(GL_ARRAY_BUFFER, VBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 2 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);
    glBindVertexArray(0);
    return true;
}

static bool isPointInCircle(float x, float y, float cx, float cy, float r) {
    float dx = x - cx, dy = y - cy;
    return (dx*dx + dy*dy) <= (r*r);
}

static void updateAnimation(void) {
    if (!physicsActive) return;

    const float targetX = 0.0f, targetY = 0.0f;
    if (!isDragging1) {
        float ax1 = -springK * (circle1X - targetX) - damping * circle1VX;
        float ay1 = -springK * (circle1Y - targetY) - damping * circle1VY;
        circle1VX += ax1 * timeStep;
        circle1VY += ay1 * timeStep;
        circle1X += circle1VX * timeStep;
        circle1Y += circle1VY * timeStep;
        circle1X = fmaxf(-0.95f, fminf(0.95f, circle1X));
        circle1Y = fmaxf(-0.95f, fminf(0.95f, circle1Y));
    } else { circle1VX = 0.0f; circle1VY = 0.0f; }

    if (!isDragging2) {
        float ax2 = -springK * (circle2X - targetX) - damping * circle2VX;
        float ay2 = -springK * (circle2Y - targetY) - damping * circle2VY;
        circle2VX += ax2 * timeStep;
        circle2VY += ay2 * timeStep;
        circle2X += circle2VX * timeStep;
        circle2Y += circle2VY * timeStep;
        circle2X = fmaxf(-0.95f, fminf(0.95f, circle2X));
        circle2Y = fmaxf(-0.95f, fminf(0.95f, circle2Y));
    } else { circle2VX = 0.0f; circle2VY = 0.0f; }

    if (!isDragging1 && !isDragging2) {
        float dx = circle1X - circle2X;
        float dy = circle1Y - circle2Y;
        float dvx = circle1VX - circle2VX;
        float dvy = circle1VY - circle2VY;
        float axPair = -pairSpringK * dx - pairDamping * dvx;
        float ayPair = -pairSpringK * dy - pairDamping * dvy;
        circle1VX += axPair * timeStep;
        circle1VY += ayPair * timeStep;
        circle2VX -= axPair * timeStep;
        circle2VY -= ayPair * timeStep;

        if (mergeKickArmed && userInteracted && isAtCenter(circle1X, circle1Y) && isAtCenter(circle2X, circle2Y)) {
            circle1VY += 0.25f;
            circle2VY -= 0.25f;
            mergeKickArmed = false;
            userInteracted = false;
        }
    }

    if (!isDragging1 && !isDragging2) {
        float speed1 = sqrtf(circle1VX*circle1VX + circle1VY*circle1VY);
        float speed2 = sqrtf(circle2VX*circle2VX + circle2VY*circle2VY);
        if (isAtCenter(circle1X, circle1Y) && isAtCenter(circle2X, circle2Y) &&
            speed1 < velocityEps && speed2 < velocityEps) {
            calmTimer += timeStep;
            if (calmTimer >= calmThreshold) {
                circle1X = initialCircle1X; circle1Y = initialCircle1Y;
                circle2X = initialCircle2X; circle2Y = initialCircle2Y;
                circle1VX = circle1VY = 0.0f;
                circle2VX = circle2VY = 0.0f;
                calmTimer = 0.0f;
                mergeKickArmed = true;
                // do not set userInteracted here so the cycle restart has no kick
            }
        } else {
            calmTimer = 0.0f;
        }
    } else {
        calmTimer = 0.0f;
    }
}

static void render(void) {
    // Deep charcoal background
    glClearColor(0.05f, 0.05f, 0.06f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);
    glUseProgram(shaderProgram);

    // Set uniforms (convert NDC [-1,1] to UV [0,1])
    float c1ux = circle1X * 0.5f + 0.5f;
    float c1uy = circle1Y * 0.5f + 0.5f;
    float c2ux = circle2X * 0.5f + 0.5f;
    float c2uy = circle2Y * 0.5f + 0.5f;
    float radiusUV = circleRadius * 0.5f;
    glUniform2f(circle1PosLoc, c1ux, c1uy);
    glUniform2f(circle2PosLoc, c2ux, c2uy);
    glUniform1f(radiusLoc, radiusUV);

    RECT rect; GetClientRect(hwnd, &rect);
    float width = (float)(rect.right - rect.left);
    float height = (float)(rect.bottom - rect.top);
    if (resolutionLoc >= 0) glUniform2f(resolutionLoc, width, height);
    if (blendKLoc >= 0) glUniform1f(blendKLoc, 0.25f);

    static int dbg = 0;
    if ((dbg++ % 60) == 0) {
        printf("Circle1: (%g, %g), Circle2: (%g, %g), Radius: %g\n", circle1X, circle1Y, circle2X, circle2Y, circleRadius);
    }

    glBindVertexArray(VAO);
    glDrawArrays(GL_TRIANGLE_FAN, 0, 4);
    glBindVertexArray(0);
    SwapBuffers(hdc);
}

// Public runner: create window, GL, load shaders, run loop, cleanup
int run_circles_animation(const char* fragmentShaderPath) {
    // Register class
    WNDCLASSA wc; ZeroMemory(&wc, sizeof(wc));
    wc.lpfnWndProc = WindowProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = "ModernOpenGLWindowC";
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    if (!RegisterClassA(&wc)) { fprintf(stderr, "RegisterClass failed\n"); return -1; }

    // Create window
    hwnd = CreateWindowExA(0, "ModernOpenGLWindowC", "Modern OpenGL Interactive Circles (C)", WS_OVERLAPPEDWINDOW,
                           CW_USEDEFAULT, CW_USEDEFAULT, 800, 600, NULL, NULL, GetModuleHandle(NULL), NULL);
    if (!hwnd) { fprintf(stderr, "CreateWindow failed\n"); return -1; }

    // DC and pixel format
    hdc = GetDC(hwnd);
    PIXELFORMATDESCRIPTOR pfd; ZeroMemory(&pfd, sizeof(pfd));
    pfd.nSize = sizeof(pfd); pfd.nVersion = 1;
    pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
    pfd.iPixelType = PFD_TYPE_RGBA; pfd.cColorBits = 32; pfd.cDepthBits = 24; pfd.cStencilBits = 8;
    int pixelFormat = ChoosePixelFormat(hdc, &pfd);
    if (!pixelFormat || !SetPixelFormat(hdc, pixelFormat, &pfd)) { fprintf(stderr, "PixelFormat failed\n"); return -1; }

    // GL context
    hglrc = wglCreateContext(hdc);
    if (!hglrc || !wglMakeCurrent(hdc, hglrc)) { fprintf(stderr, "GL context failed\n"); return -1; }

    if (!setupOpenGL()) { fprintf(stderr, "OpenGL setup failed\n"); return -1; }

    // Now create and bind shader program for requested fragment shader
    shaderProgram = createShaderProgram(fragmentShaderPath);
    if (shaderProgram == 0) { fprintf(stderr, "Shader creation failed\n"); return -1; }
    circle1PosLoc = glGetUniformLocation(shaderProgram, "circle1Pos");
    circle2PosLoc = glGetUniformLocation(shaderProgram, "circle2Pos");
    radiusLoc     = glGetUniformLocation(shaderProgram, "radius");
    resolutionLoc = glGetUniformLocation(shaderProgram, "resolution");
    blendKLoc     = glGetUniformLocation(shaderProgram, "blendK");

    printf("Uniform locations:\n");
    printf("circle1Pos: %d\n", circle1PosLoc);
    printf("circle2Pos: %d\n", circle2PosLoc);
    printf("radius: %d\n", radiusLoc);
    printf("blendK: %d\n", blendKLoc);
    printf("resolution: %d\n", resolutionLoc);

    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    SetTimer(hwnd, 1, 16, NULL);
    ShowWindow(hwnd, SW_SHOW);
    UpdateWindow(hwnd);

    printf("Modern OpenGL Interactive Circles (C) created!\n");
    printf("Controls:\n- Click and drag circles to move them\n- ESC: Exit\n");
    printf("Circle1: (%g, %g), Circle2: (%g, %g), Radius: %g\n", circle1X, circle1Y, circle2X, circle2Y, circleRadius);

    MSG msg; ZeroMemory(&msg, sizeof(msg));
    while (GetMessage(&msg, NULL, 0, 0)) { TranslateMessage(&msg); DispatchMessage(&msg); }

    wglMakeCurrent(NULL, NULL);
    wglDeleteContext(hglrc);
    ReleaseDC(hwnd, hdc);
    return 0;
}

static void updateCirclePositions(int mouseX, int mouseY) {
    RECT rect; GetClientRect(hwnd, &rect);
    float width = (float)(rect.right - rect.left);
    float height = (float)(rect.bottom - rect.top);
    int mx = mouseX, my = mouseY;
    if (mx < 0) mx = 0; if (mx > (int)width - 1) mx = (int)width - 1;
    if (my < 0) my = 0; if (my > (int)height - 1) my = (int)height - 1;
    float nx = (mx) / width * 2.0f - 1.0f;
    float ny = 1.0f - (my) / height * 2.0f;
    if (isDragging1) {
        circle1X = fmaxf(-0.8f, fminf(0.8f, nx));
        circle1Y = fmaxf(-0.8f, fminf(0.8f, ny));
    }
    if (isDragging2) {
        circle2X = fmaxf(-0.8f, fminf(0.8f, nx));
        circle2Y = fmaxf(-0.8f, fminf(0.8f, ny));
    }
}

LRESULT CALLBACK WindowProc(HWND hwnd_, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
        case WM_PAINT: {
            PAINTSTRUCT ps; BeginPaint(hwnd_, &ps); render(); EndPaint(hwnd_, &ps); return 0;
        }
        case WM_LBUTTONDOWN: {
            int mouseX = GET_X_LPARAM(lParam);
            int mouseY = GET_Y_LPARAM(lParam);
            RECT rect; GetClientRect(hwnd_, &rect);
            float width = (float)(rect.right - rect.left);
            float height = (float)(rect.bottom - rect.top);
            if (mouseX < 0) mouseX = 0; if (mouseX > (int)width - 1) mouseX = (int)width - 1;
            if (mouseY < 0) mouseY = 0; if (mouseY > (int)height - 1) mouseY = (int)height - 1;
            float nx = (mouseX) / width * 2.0f - 1.0f;
            float ny = 1.0f - (mouseY) / height * 2.0f;
            if (isPointInCircle(nx, ny, circle1X, circle1Y, circleRadius)) { isDragging1 = true; SetCapture(hwnd_); }
            else if (isPointInCircle(nx, ny, circle2X, circle2Y, circleRadius)) { isDragging2 = true; SetCapture(hwnd_); }
            userInteracted = true;
            return 0;
        }
        case WM_LBUTTONUP: {
            isDragging1 = false; isDragging2 = false; ReleaseCapture(); return 0;
        }
        case WM_MOUSEMOVE: {
            if (isDragging1 || isDragging2) {
                int mouseX = GET_X_LPARAM(lParam);
                int mouseY = GET_Y_LPARAM(lParam);
                updateCirclePositions(mouseX, mouseY);
                InvalidateRect(hwnd_, NULL, FALSE);
            }
            return 0;
        }
        case WM_KEYDOWN: {
            if (wParam == VK_ESCAPE) { PostQuitMessage(0); }
            return 0;
        }
        case WM_TIMER: { updateAnimation(); InvalidateRect(hwnd_, NULL, FALSE); return 0; }
        case WM_DESTROY: { KillTimer(hwnd_, 1); PostQuitMessage(0); return 0; }
    }
    return DefWindowProc(hwnd_, uMsg, wParam, lParam);
}

int main(void) {
    // Default run with the current fragment shader
    return run_circles_animation("modern_fragment.glsl");
}


