#version 330 core
out vec4 FragColor;

// Positions in UV [0,1]
uniform vec2 rect1Pos;
uniform vec2 rect2Pos;
uniform vec2 rect3Pos;
uniform vec2 rect4Pos;
uniform vec2 rectSize;     // half-size (UV units)
uniform float blendK;      // smooth-union softness
uniform vec2 resolution;   // window size in pixels

float sdBox(vec2 p, vec2 b) {
    // Signed distance to axis-aligned rectangle centered at origin with half-size b
    vec2 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float smoothMin(float a, float b, float k) {
    float kk = max(k, 1e-6);
    float h = max(kk - abs(a - b), 0.0) / kk;
    return min(a, b) - h*h*h * kk * (1.0 / 6.0);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    // Aspect corrected space (x stretched by aspect)
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 suv = vec2(uv.x * aspect, uv.y);
    vec2 sSize = vec2(rectSize.x * aspect, rectSize.y);

    vec2 r1 = vec2(rect1Pos.x * aspect, rect1Pos.y);
    vec2 r2 = vec2(rect2Pos.x * aspect, rect2Pos.y);
    vec2 r3 = vec2(rect3Pos.x * aspect, rect3Pos.y);
    vec2 r4 = vec2(rect4Pos.x * aspect, rect4Pos.y);

    float d1 = sdBox(suv - r1, sSize);
    float d2 = sdBox(suv - r2, sSize);
    float d3 = sdBox(suv - r3, sSize);
    float d4 = sdBox(suv - r4, sSize);

    // Sticky increases when rectangles are closer on average
    float avgDist = (length(r1 - r2) + length(r1 - r3) + length(r1 - r4)
                   + length(r2 - r3) + length(r2 - r4) + length(r3 - r4)) / 6.0;
    float sticky = clamp(1.0 - avgDist, 0.0, 1.0);
    float k = max(blendK + sticky * 0.35, 1e-6);

    float d = smoothMin(d1, d2, k);
    d = smoothMin(d, d3, k);
    d = smoothMin(d, d4, k);

    float aa = fwidth(d) + 1e-4;
    float mask = smoothstep(aa, -aa, d);

    // Solid TV-friendly cyan
    vec3 col = vec3(0.10, 0.85, 0.95);
    FragColor = vec4(col * mask, mask);
}


