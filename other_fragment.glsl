#version 330 core
out vec4 FragColor;

uniform vec2 circle1Pos; // UV space [0,1]
uniform vec2 circle2Pos; // UV space [0,1]
uniform float radius;
uniform float blendK;
uniform vec2 resolution; // window size in pixels

float sdCircle(vec2 p, vec2 c, float r) {
    return length(p - c) - r;
}

float smoothMin(float a, float b, float k) {
    float kk = max(k, 1e-6);
    float h = max(kk - abs(a - b), 0.0) / kk;
    return min(a, b) - h*h*h * kk * (1.0 / 6.0);
}

void main() {
    // UV in [0,1]
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    // Aspect-correct coordinates so circles stay round
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 suv = vec2(uv.x * aspect, uv.y);
    vec2 c1 = vec2(circle1Pos.x * aspect, circle1Pos.y);
    vec2 c2 = vec2(circle2Pos.x * aspect, circle2Pos.y);

    // Signed distances and smooth-union blending
    float d1 = sdCircle(suv, c1, radius);
    float d2 = sdCircle(suv, c2, radius);

    float centerDist = distance(c1, c2);
    float sticky = clamp(1.0 - centerDist, 0.0, 1.0);
    float k = max(blendK + sticky * 0.35, 1e-6);
    float d = smoothMin(d1, d2, k);

    // Anti-aliased surface mask
    float aa = fwidth(d) + 1e-4;
    float surface = smoothstep(aa, -aa, d);

    // Soft-body interior falloff for depth (no edge hue change)
    float interior = clamp((-d) / max(radius * 0.8, 1e-4), 0.0, 1.0);
    vec3 base = vec3(0.62, 0.80, 1.00); // soft, TV-friendly blue
    vec3 col = base * (0.55 + 0.45 * interior);

    FragColor = vec4(col * surface, surface);
}


