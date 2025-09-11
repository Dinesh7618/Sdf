#version 330 core
out vec4 FragColor;

uniform vec2 circle1Pos; // in UV space [0,1]
uniform vec2 circle2Pos; // in UV space [0,1]
uniform float radius;
uniform float blendK; // smoothing factor for smoothMin
uniform vec2 resolution; // window size in pixels

// Signed distance to a circle: negative inside, positive outside
float sdCircle(vec2 p, vec2 center, float r) {
    return length(p - center) - r;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    
    // Aspect-correct coordinates so circles are not distorted
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 suv = vec2(uv.x * aspect, uv.y);
    vec2 c1 = vec2(circle1Pos.x * aspect, circle1Pos.y);
    vec2 c2 = vec2(circle2Pos.x * aspect, circle2Pos.y);
    
    // Signed distances to circles (inside < 0, outside > 0)
    float d1 = sdCircle(suv, c1, radius);
    float d2 = sdCircle(suv, c2, radius);

    // smoothMin for blending SDFs
    // Make sticky blending stronger when circles are close
    float centerDist = distance(c1, c2);
    float sticky = clamp(1.0 - centerDist, 0.0, 1.0); // closer -> higher
    float k = max(blendK + sticky * 0.35, 1e-6);
    float h = max(k - abs(d1 - d2), 0.0) / k;
    float d = min(d1, d2) - h * h * h * k * (1.0 / 6.0);

    // Anti-aliased edge
    float aa = fwidth(d);
    float mask = 1.0 - smoothstep(0.0, aa, d);

    // Solid, TV-friendly color (no edge hue variation)
    vec3 baseCol = vec3(0.22, 0.78, 0.98);
    vec3 col = baseCol;
    FragColor = vec4(col * mask, mask);
}
