// --- helpers ---
float sdCircle(vec2 p, float r) { return length(p) - r; }

float sdBox(vec2 p, vec2 b) {
    vec2 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sdRoundBox(vec2 p, vec2 b, float rad) {
    vec2 q = abs(p) - b + vec2(rad);
    return length(max(q, 0.0)) - rad + min(max(q.x, q.y), 0.0);
}

float sdEllipse(vec2 p, vec2 ab) {
    // approximate ellipse SDF
    return length(p / ab) - 1.0;
}

// regular N-gon (approx)
float sdNgon(vec2 p, int n, float r) {
    float a = atan(p.y, p.x);
    float k = 6.283185307179586 / float(n);
    float d = cos(k * 0.5) / cos(mod(a + k * 0.5, k) - k * 0.5);
    return length(p) - r * d;
}

// radial-wave modifier: r' = r + k*cos(n*theta)
float sdWavyCircle(vec2 p, float r, int petals, float amp) {
    float ang = atan(p.y, p.x);
    float modR = r + amp * cos(float(petals) * ang);
    return length(p) - modR;
}

// star/sharp burst (sharper spikes than cosine)
float sdStar(vec2 p, int spikes, float r, float spikeAmp) {
    float a = atan(p.y, p.x);
    float m = cos(float(spikes) * a);
    // sharpen by power
    float spike = spikeAmp * sign(m) * pow(abs(m), 0.6);
    return length(p) - (r + spike);
}

// pixelate helper
vec2 pixelize(vec2 p, float px) {
    return floor(p * px) / px;
}

// union and intersection helpers (useful when composing)
float opUnion(float a, float b) { return min(a, b); }
float opIntersect(float a, float b) { return max(a, b); }
float opSubtract(float a, float b) { return max(a, -b); }


// --- 35 shape SDFs (center at origin) ---

// 1 Circle
float sdCircleShape(vec2 p) {
    return sdCircle(p, 0.35);
}

// 2 Square
float sdSquare(vec2 p) {
    return sdBox(p, vec2(0.32));
}

// 3 Slanted (rotated rounded box)
float sdSlanted(vec2 p) {
    float a = 15.0 * 3.14159265 / 180.0;
    mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
    return sdRoundBox(R * p, vec2(0.28, 0.28), 0.06);
}

// 4 Arch (box with top circle cut off to make arch)
float sdArch(vec2 p) {
    // arch = intersection of rounded rectangle and circle above
    float box = sdRoundBox(p - vec2(0.0, -0.05), vec2(0.32, 0.2), 0.06);
    float cap = sdCircle(p - vec2(0.0, 0.08), 0.36);
    return opIntersect(box, cap);
}

// 5 Semicircle (top half of circle)
float sdSemicircle(vec2 p) {
    float d = sdCircle(p, 0.35);
    // cut bottom half: force outside below y=0
    float halfPlane = p.y; // positive above origin
    return opUnion(d, -halfPlane); // d but clipped by plane (inside = negative)
}

// 6 Oval
float sdOval(vec2 p) {
    return sdEllipse(p, vec2(0.42, 0.25));
}

// 7 Pill (rounded long capsule)
float sdPill(vec2 p) {
    // capsule SDF = length(abs(p.x)-halfwidth, p.y) - radius, but use rounded box
    return sdRoundBox(p, vec2(0.25, 0.12), 0.18);
}

// 8 Triangle (equilateral)
float sdTriangle(vec2 p) {
    const float k = 1.7320508075688772; // sqrt(3)
    p.x = abs(p.x) - 0.30;
    p.y = p.y + 0.17;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
    p.x -= clamp(p.x, -0.30, 0.30);
    return -length(p) * sign(p.y);
}

// 9 Arrow (triangle head + rectangular body union)
float sdArrow(vec2 p) {
    float head = sdTriangle(p * vec2(1.0, 1.0) + vec2(0.0, -0.05));
    float body = sdBox(p + vec2(0.0, 0.15), vec2(0.08, 0.18));
    return opUnion(head, body);
}

// 10 Fan (quarter circle)
float sdFan(vec2 p) {
    // quarter circle in top-right quadrant
    float d = sdCircle(p, 0.38);
    // disallow left and bottom (make large positive outside)
    if (p.x < 0.0 || p.y < 0.0) d = 1.0;
    return d;
}

// 11 Diamond (rotated square)
float sdDiamond(vec2 p) {
    mat2 R = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678);
    return sdBox(R * p, vec2(0.30));
}

// 12 Clamshell (half-ellipse top)
float sdClamshell(vec2 p) {
    float d = sdEllipse(p, vec2(0.45, 0.28));
    if (p.y < -0.02) d = 1.0; // keep top half (adjust to taste)
    return d;
}

// 13 Pentagon
float sdPentagon(vec2 p) {
    return sdNgon(p, 5, 0.42);
}

// 14 Gem (rounded hex-ish diamond)
float sdGem(vec2 p) {
    // gem -> 6-gon with small roundness
    float g = sdNgon(p, 6, 0.36);
    return g;
}

// 15 Sunny (wavy circle with visible "rays")
float sdSunny(vec2 p) {
    return sdWavyCircle(p, 0.35, 8, 0.06);
}

// 16 Very Sunny (more petals / deeper)
float sdVerySunny(vec2 p) {
    return sdWavyCircle(p, 0.35, 12, 0.09);
}

// 17 4-sided cookie (wavy square)
float sdCookie4(vec2 p) {
    // use 4-gon + radial bump by angle to emulate cookie
    float base = sdNgon(p, 4, 0.35);
    float ang = atan(p.y, p.x);
    float bump = 0.06 * cos(4.0 * ang);
    return length(p) - (0.35 + bump);
}

// 18 6-sided cookie
float sdCookie6(vec2 p) {
    return sdWavyCircle(p, 0.35, 6, 0.07);
}

// 19 7-sided cookie
float sdCookie7(vec2 p) {
    return sdWavyCircle(p, 0.35, 7, 0.06);
}

// 20 9-sided cookie
float sdCookie9(vec2 p) {
    return sdWavyCircle(p, 0.35, 9, 0.05);
}

// 21 12-sided cookie
float sdCookie12(vec2 p) {
    return sdWavyCircle(p, 0.35, 12, 0.04);
}

// 22 4-leaf clover (4 lobes)
float sdClover4(vec2 p) {
    // polar radius modulated by cos(2*theta)
    float ang = atan(p.y, p.x);
    float r = 0.28 + 0.10 * cos(2.0 * ang);
    return length(p) - r;
}

// 23 8-leaf clover
float sdClover8(vec2 p) {
    float ang = atan(p.y, p.x);
    float r = 0.28 + 0.10 * cos(4.0 * ang);
    return length(p) - r;
}

// 24 Burst (sharp spikes)
float sdBurst(vec2 p) {
    return sdStar(p, 12, 0.33, 0.16);
}

// 25 Soft burst (rounded spikes)
float sdSoftBurst(vec2 p) {
    // smoother spike by squaring cosine
    float a = atan(p.y, p.x);
    float m = pow(cos(10.0 * a), 2.0);
    float r = 0.32 + 0.14 * m;
    return length(p) - r;
}

// 26 Boom (many thin spikes)
float sdBoom(vec2 p) {
    return sdStar(p, 20, 0.30, 0.18);
}

// 27 Soft boom (many soft spikes)
float sdSoftBoom(vec2 p) {
    float a = atan(p.y, p.x);
    float m = cos(18.0 * a);
    float spike = 0.12 * pow(abs(m), 0.7);
    return length(p) - (0.32 + spike);
}

// 28 Flower (petal-y smooth)
float sdFlower(vec2 p) {
    float a = atan(p.y, p.x);
    float pet = 0.14 * cos(8.0 * a);
    return length(p) - (0.30 + pet);
}

// 29 Puffy (many rounded bumps; approximated by stronger modulation)
float sdPuffy(vec2 p) {
    // emulate many little circles by high-order radial modulation
    float a = atan(p.y, p.x);
    float bumps = 0.08 * cos(12.0 * a) + 0.05 * cos(6.0 * a);
    return length(p) - (0.32 + bumps);
}

// 30 Puffy diamond (diamond with bumps)
float sdPuffyDiamond(vec2 p) {
    float d = sdNgon(p, 4, 0.36);
    float a = atan(p.y, p.x);
    float bumps = 0.06 * cos(8.0 * a);
    return length(p) - (0.36 + bumps);
}

// 31 Ghost-ish
float sdGhostish(vec2 p) {
    // head circle
    float head = sdCircle(p - vec2(0.0, 0.07), 0.30);
    // bottom wavy boundary (use intersection with a wave)
    float wave = p.y + 0.18 + 0.06 * sin(p.x * 25.0);
    // intersection to cut the bottom to give ghost-tail shape
    return opIntersect(head, wave);
}

// 32 Pixel circle
float sdPixelCircle(vec2 p) {
    vec2 q = pixelize(p, 10.0); // 10 px blocks
    return sdCircle(q, 0.32);
}

// 33 Pixel triangle
float sdPixelTriangle(vec2 p) {
    vec2 q = pixelize(p, 12.0);
    // reuse sdTriangle on quantized coords
    const float k = 1.7320508075688772;
    vec2 pp = q;
    pp.x = abs(pp.x) - 0.30;
    pp.y = pp.y + 0.17;
    if (pp.x + k * pp.y > 0.0) pp = vec2(pp.x - k * pp.y, -k * pp.x - pp.y) * 0.5;
    pp.x -= clamp(pp.x, -0.30, 0.30);
    return -length(pp) * sign(pp.y);
}

// 34 Bun (two stacked/overlapping rounded shapes)
float sdBun(vec2 p) {
    float head = sdCircle(p - vec2(0.0, 0.08), 0.26);
    float body = sdRoundBox(p + vec2(0.0, 0.12), vec2(0.22, 0.12), 0.12);
    return opUnion(head, body);
}

// 35 Heart
float sdHeart(vec2 p) {
    // approximate heart by mapping and a combination of two circles and a rotated box
    p *= 1.0;            // scale if needed
    p.y -= 0.05;
    float a = length(p - vec2(-0.12, 0.05)) - 0.18;
    float b = length(p - vec2(0.12, 0.05)) - 0.18;
    float mid = sdRoundBox(p - vec2(0.0, -0.12), vec2(0.16, 0.18), 0.05);
    // union of lobes and intersection with mid to form heart shape
    float lobes = opUnion(a, b);
    return opUnion(mid, lobes);
}
