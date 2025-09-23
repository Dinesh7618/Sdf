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




#ifdef GL_ES
precision mediump float;
#endif

#define MAX_STEPS 100
#define MAX_DIST 100.
#define SURF_DIST .001

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse; // optional

// new uniforms to control the cycle
uniform float u_m;       // maximum height (m). If not set or <=0, DEFAULT_M is used.
uniform float u_period;  // period (seconds) for 0->m->0 cycle. If not set or <=0, DEFAULT_PERIOD is used.

// helpers
float dot2(vec2 v) { return dot(v, v); }

// axis-aligned box SDF (finite box)
float dBox(vec3 p, vec3 s) {
    return length(max(abs(p) - s, 0.));
}

// Inverted Paraboloid SDF (finite "bell" that opens downward):
// Surface: y = h - a*r^2  for 0 <= y <= h  (apex at y=h, rim at y=0, r=r_base).
float sdParaboloidInverted(vec3 p, float a, float h) {
    float r = length(p.xz);
    // lateral implicit: g = p.y - h + a*r^2
    float g = p.y - h + a * r * r;
    // gradient magnitude of g wrt (y,r): sqrt(1 + (dg/dr)^2) with dg/dr = 2*a*r
    float denom = sqrt(1.0 + 4.0 * a * a * r * r);
    float sd_lateral = g / denom;    // signed distance to lateral surface
    float sd_top = p.y - h;          // distance to top plane (negative below top)
    float sd_bottom = -p.y;          // distance to bottom plane y=0 (negative above bottom)
    // intersection of half-spaces => use max
    return max(sd_lateral, max(sd_top, sd_bottom));
}

// Smooth minimum (blend variant).
// Returns a smooth-min between `a` and `b` using smoothing width `k`.
// Also outputs the blend weight `w` (0 -> result is b (sheet), 1 -> result is a (paraboloid)).
float smin_blend(float a, float b, float k, out float w) {
    k = max(k, 1e-6);
    w = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, w) - k * w * (1.0 - w);
}

// Analytic normal for inverted paraboloid local point (p in paraboloid local space).
// For surface g = p.y - h + a*(x^2 + z^2) = 0, gradient is (2a*x, 1, 2a*z)
vec3 paraboloidNormalAnalytic(vec3 lp, float a) {
    vec3 g = vec3(2.0 * a * lp.x, 1.0, 2.0 * a * lp.z);
    return normalize(g);
}

// Scene constants (original shape baseline values)
const float SHEET_Y = 1.0;
const float SHEET_HALF_THICKNESS = 0.02;
const vec3 SHEET_CENTER = vec3(0.0, SHEET_Y, 6.0);
// small sheet (half-sizes)
const vec3 SHEET_HALF_SIZE = vec3(4.0, SHEET_HALF_THICKNESS, 3.0);

// ORIGINAL paraboloid params used to preserve shape ratio when animating
const float PAR_H0 = 1.4;        // original dome height (baseline)
const float PAR_RBASE0 = 0.8;    // original rim/base radius at y = 0 (baseline)

// Paraboloid placement
const float ZPOS = 6.0;
const float SPACING = 3.0;
const float STARTX = -6.0;

// smoothing radius between each paraboloid and the sheet (tweak to taste)
const float SMOOTH_K = 0.09;

// unified material color (sheet baseline)
const vec3 BASE_COLOR = vec3(0.15, 0.2, 0.24);

// Mesh overlay tuning (very small cell + thin lines)
const float MESH_CELL = 0.04;         // cell size (small -> many cells)
const float MESH_LINE_WIDTH = 0.0025; // half-width of line (in world units)
const float MESH_STRENGTH = 0.88;     // blend strength of mesh (0..1)
const vec3  MESH_COLOR = vec3(0.18, 0.45, 0.95); // blue mesh

// Default fallbacks if uniforms aren't provided
const float DEFAULT_M = PAR_H0;
const float DEFAULT_PERIOD = 4.0;

// Scene SDF: each paraboloid is smoothly merged with the sheet box using smin_blend
// NOTE: PAR_H and PAR_RBASE are computed dynamically per-frame from u_time and u_m
float GetDist(vec3 p) {
    // resolve cycle parameters with fallbacks
    float maxM = (u_m > 1e-6) ? u_m : DEFAULT_M;
    float period = (u_period > 1e-6) ? u_period : DEFAULT_PERIOD;

    // waveform -> 0..1..0 using abs(sin)
    float phase = u_time * 3.14159265 / period; // sin period: 0..π gives 0->1->0
    float t = abs(sin(phase));

    // current animated paraboloid height (0 -> maxM -> 0)
    float par_h = maxM * t;

    // scale base radius proportionally to baseline ratio to keep shape similar:
    // par_rbase = par_h * (PAR_RBASE0 / PAR_H0)
    float par_rbase = (par_h > 1e-6) ? par_h * (PAR_RBASE0 / PAR_H0) : 0.0;

    // sheet (finite rectangular thin box)
    float dSheetBox = dBox(p - SHEET_CENTER, SHEET_HALF_SIZE);
    float d = dSheetBox;

    // compute 'a' so that paraboloid rim radius at y = 0 equals par_rbase
    float denom = max(par_rbase * par_rbase, 1e-6);
    float a = par_h / denom;

    // sheet top Y (where paraboloid rim sits)
    float sheetTopY = SHEET_CENTER.y + SHEET_HALF_THICKNESS;

    // union with each paraboloid (smoothly)
    for (int i = 0; i < 5; i++) {
        float x = STARTX + SPACING * float(i);
        vec3 basePos = vec3(x, sheetTopY, ZPOS);
        vec3 lp = p - basePos; // local point where local y=0 is sheet top

        // use current par_h and a
        float dp = sdParaboloidInverted(lp, a, par_h);
        float w;
        float s = smin_blend(dp, dSheetBox, SMOOTH_K, w);
        d = min(d, s);
    }

    // distant backdrop floor (kept far)
    float backdrop = p.y + 20.0;
    d = min(d, backdrop);

    return d;
}

// Ray marcher + normal via central differences on the full scene SDF
float RayMarch(vec3 ro, vec3 rd) {
    float dO = 0.;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = GetDist(p);
        dO += dS;
        if (dO > MAX_DIST || dS < SURF_DIST) break;
    }
    return dO;
}

vec3 GetNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
        GetDist(p + vec3(e,0.0,0.0)) - GetDist(p - vec3(e,0.0,0.0)),
        GetDist(p + vec3(0.0,e,0.0)) - GetDist(p - vec3(0.0,e,0.0)),
        GetDist(p + vec3(0.0,0.0,e)) - GetDist(p - vec3(0.0,0.0,e))
    ));
}

// Analytic top-face normal for the sheet (used for blending). For most hits on top face it's (0,1,0).
vec3 sheetTopNormal() {
    return vec3(0.0, 1.0, 0.0);
}

// Small helper: generate thin anti-aliased grid line value [0..1] for given world (or local) pos.xy
// NOTE: 'pixelSize' should be the estimated world-space size of one pixel at the surface point.
float meshLine(vec2 pos, float cell, float lineWidth, float pixelSize) {
    // distance to nearest grid line along each axis (in world units)
    vec2 f = fract(pos / cell);
    float dx = min(f.x, 1.0 - f.x) * cell;
    float dy = min(f.y, 1.0 - f.y) * cell;
    float d = min(dx, dy);

    // anti-aliasing: use estimated pixel size in world units instead of fwidth
    float af = max(pixelSize, 1e-6);

    // smoothstep for line (1 at center, 0 away)
    float t = smoothstep(lineWidth + af, lineWidth, d);
    return t;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;

    // Camera: more top-down
    vec3 ro = vec3(0.0, 6.5, 0.0);        // raise camera
    vec3 lookAt = vec3(0.0, 1.0, 6.0);    // center of sheet/domes
    vec3 forward = normalize(lookAt - ro);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = cross(right, forward);

    float fov = 0.75; // smaller = zoom in
    vec3 rd = normalize(forward + uv.x * right * fov + uv.y * up * fov);

    float d = RayMarch(ro, rd);

    vec3 col = vec3(0.0);
    vec3 lightPos = vec3(0.0, 6.0, 6.0);

    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;

        // --- compute animation state (used to drive color) ---
        float maxM = (u_m > 1e-6) ? u_m : DEFAULT_M;
        float period = (u_period > 1e-6) ? u_period : DEFAULT_PERIOD;
        float phase = u_time * 3.14159265 / period;
        float animT = abs(sin(phase));         // 0 -> 1 -> 0
        float par_h = maxM * animT;
        float colorFactor = (maxM > 1e-6) ? clamp(par_h / maxM, 0.0, 1.0) : 0.0;

        // Determine paraboloid parameters (used for normal/blend calc below)
        float par_rbase = (par_h > 1e-6) ? par_h * (PAR_RBASE0 / PAR_H0) : 0.0;
        float a = (par_rbase > 1e-6) ? par_h / (par_rbase * par_rbase) : 0.0;

        // Determine which paraboloid (if any) contributes most to the minimum
        float dSheetRaw = dBox(p - SHEET_CENTER, SHEET_HALF_SIZE);

        float minS = 1e6;
        float minW = 0.0;
        vec3 chosenLocalP = vec3(0.0);
        float sheetTopY = SHEET_CENTER.y + SHEET_HALF_THICKNESS;

        for (int i = 0; i < 5; i++) {
            float x = STARTX + SPACING * float(i);
            vec3 basePos = vec3(x, sheetTopY, ZPOS);
            vec3 lp = p - basePos;
            float dp = sdParaboloidInverted(lp, a, par_h);
            float w;
            float s = smin_blend(dp, dSheetRaw, SMOOTH_K, w);
            if (s < minS) {
                minS = s;
                minW = w;
                chosenLocalP = lp;
            }
        }

        // Analytic paraboloid normal (local), and sheet top normal
        vec3 nPar = paraboloidNormalAnalytic(chosenLocalP, a);
        vec3 nSheet = sheetTopNormal();

        // Blend normals by the same smooth-min weight (w): 0 -> sheet, 1 -> paraboloid
        vec3 n = normalize(mix(nSheet, nPar, min(minW, 1.0)));

        // lighting: ambient + diffuse
        vec3 l = normalize(lightPos - p);
        float dif = clamp(dot(n, l), 0.0, 1.0);
        float ambient = 0.18;

        // ------------------------
        // dynamic paraboloid color (ONLY for paraboloid)
        // ------------------------
        vec3 warmOrange = vec3(1.0, 0.6, 0.2);
        float blendAmt = smoothstep(0.0, 1.0, colorFactor); // 0..1 by height fraction
        // a dynamic color for paraboloid only
        vec3 dynamicParColor = mix(BASE_COLOR, warmOrange, blendAmt * 0.9);
        dynamicParColor += vec3(0.04) * blendAmt; // slight brighten with height

        // Now blend base color between sheet BASE_COLOR and dynamicParColor using the geometry blend weight minW
        float geoW = min(minW, 1.0);
        vec3 blendedBase = mix(BASE_COLOR, dynamicParColor, geoW);

        // ------------------------
        // specular: stronger on paraboloid only
        // ------------------------
        vec3 viewDir = normalize(ro - p);
        vec3 halfVec = normalize(l + viewDir);
        float specPow = 64.0;
        // spec strength for paraboloid depends on height
        float specStrengthPar = mix(0.6, 1.0, blendAmt * 0.6);
        float specStrength = mix(0.6, specStrengthPar, geoW);
        float spec = pow(max(dot(n, halfVec), 0.0), specPow) * specStrength;

        // final lighting (only base color changed on paraboloid portion)
        vec3 lit = blendedBase * (ambient + dif * 0.86);
        lit += vec3(1.0) * spec;

        // slight rim/height-driven tint but only influence where paraboloid contributes:
        float heightDenom = max(2.0 * par_h, 1e-6);
        float heightTint = (par_h > 1e-6) ? clamp((p.y - SHEET_Y) / heightDenom, 0.0, 1.0) : 0.0;
        vec3 tint = mix(vec3(0.98), vec3(0.92), heightTint) * 0.02 * geoW;
        col = pow(lit + tint, vec3(1.0 / 2.2));

        // -------------------------
        // Mesh overlay (blended, blue) - unchanged (mesh stays blue even over paraboloid)
        // -------------------------
        float distToCam = length(ro - p);
        float pixelWorldSize = (fov * distToCam) / u_resolution.y;
        float sheetMesh = meshLine(p.xz, MESH_CELL, MESH_LINE_WIDTH, pixelWorldSize);
        float paraMesh  = meshLine(chosenLocalP.xz, MESH_CELL, MESH_LINE_WIDTH, pixelWorldSize);
        float meshVal = mix(sheetMesh, paraMesh, geoW);
        col = mix(col, MESH_COLOR, meshVal * MESH_STRENGTH);

        // -------------------------
        // Make everything outside the sheet footprint black
        // -------------------------
        vec3 localXZ = p - SHEET_CENTER;
        if (abs(localXZ.x) > SHEET_HALF_SIZE.x || abs(localXZ.z) > SHEET_HALF_SIZE.z) {
            col = vec3(0.0);
        }

    } else {
        // background outside the sheet -> black
        col = vec3(0.0);
    }

    gl_FragColor = vec4(col, 1.0);
}




#ifdef GL_ES
precision mediump float;
#endif

#define MAX_STEPS 100
#define MAX_DIST 100.
#define SURF_DIST .001

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse; // optional

// helpers
float dot2(vec2 v) { return dot(v, v); }

// axis-aligned box SDF (finite box)
float dBox(vec3 p, vec3 s) {
    return length(max(abs(p) - s, 0.));
}

// Inverted Paraboloid SDF (finite "bell" that opens downward):
// Surface: y = h - a*r^2  for 0 <= y <= h  (apex at y=h, rim at y=0, r=r_base).
float sdParaboloidInverted(vec3 p, float a, float h) {
    float r = length(p.xz);
    // lateral implicit: g = p.y - h + a*r^2
    float g = p.y - h + a * r * r;
    // gradient magnitude of g wrt (y,r): sqrt(1 + (dg/dr)^2) with dg/dr = 2*a*r
    float denom = sqrt(1.0 + 4.0 * a * a * r * r);
    float sd_lateral = g / denom;    // signed distance to lateral surface
    float sd_top = p.y - h;          // distance to top plane (negative below top)
    float sd_bottom = -p.y;          // distance to bottom plane y=0 (negative above bottom)
    // intersection of half-spaces => use max
    return max(sd_lateral, max(sd_top, sd_bottom));
}

// Smooth minimum (blend variant).
// Returns a smooth-min between `a` and `b` using smoothing width `k`.
// Also outputs the blend weight `w` (0 -> result is b (sheet), 1 -> result is a (paraboloid)).
float smin_blend(float a, float b, float k, out float w) {
    k = max(k, 1e-6);
    w = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, w) - k * w * (1.0 - w);
}

// Analytic normal for inverted paraboloid local point (p in paraboloid local space).
// For surface g = p.y - h + a*(x^2 + z^2) = 0, gradient is (2a*x, 1, 2a*z)
vec3 paraboloidNormalAnalytic(vec3 lp, float a) {
    vec3 g = vec3(2.0 * a * lp.x, 1.0, 2.0 * a * lp.z);
    return normalize(g);
}

// Scene constants
const float SHEET_Y = 1.0;
const float SHEET_HALF_THICKNESS = 0.02;
const vec3 SHEET_CENTER = vec3(0.0, SHEET_Y, 6.0);
const vec3 SHEET_HALF_SIZE = vec3(9.0, SHEET_HALF_THICKNESS, 6.0);

// Paraboloid parameters
const float PAR_H = 1.9;        // dome height (local y top)
const float PAR_RBASE = 0.8;    // rim/base radius at y = 0 (sheet top)
const float ZPOS = 6.0;
const float SPACING = 3.0;
const float STARTX = -6.0;

// smoothing radius between each paraboloid and the sheet (tweak to taste)
const float SMOOTH_K = 0.12;

// unified material color (sheet + deformations)
const vec3 BASE_COLOR = vec3(0.15, 0.2, 0.24);

// Scene SDF: each paraboloid is smoothly merged with the sheet box using smin_blend
float GetDist(vec3 p) {
    // sheet (finite rectangular thin box)
    float dSheetBox = dBox(p - SHEET_CENTER, SHEET_HALF_SIZE);
    float d = dSheetBox;

    // compute 'a' so that paraboloid rim radius at y = 0 equals PAR_RBASE
    float a = PAR_H / (PAR_RBASE * PAR_RBASE);

    // sheet top Y (where paraboloid rim sits)
    float sheetTopY = SHEET_CENTER.y + SHEET_HALF_THICKNESS;

    // union with each paraboloid (smoothly)
    for (int i = 0; i < 5; i++) {
        float x = STARTX + SPACING * float(i);
        vec3 basePos = vec3(x, sheetTopY, ZPOS);
        vec3 lp = p - basePos; // local point where local y=0 is sheet top
        float dp = sdParaboloidInverted(lp, a, PAR_H);
        float w;
        float s = smin_blend(dp, dSheetBox, SMOOTH_K, w);
        d = min(d, s);
    }

    // distant backdrop floor (kept far)
    float backdrop = p.y + 20.0;
    d = min(d, backdrop);

    return d;
}

// Ray marcher + normal via central differences on the full scene SDF
float RayMarch(vec3 ro, vec3 rd) {
    float dO = 0.;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = GetDist(p);
        dO += dS;
        if (dO > MAX_DIST || dS < SURF_DIST) break;
    }
    return dO;
}

vec3 GetNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
        GetDist(p + vec3(e,0.0,0.0)) - GetDist(p - vec3(e,0.0,0.0)),
        GetDist(p + vec3(0.0,e,0.0)) - GetDist(p - vec3(0.0,e,0.0)),
        GetDist(p + vec3(0.0,0.0,e)) - GetDist(p - vec3(0.0,0.0,e))
    ));
}

// Analytic top-face normal for the sheet (used for blending). For most hits on top face it's (0,1,0).
vec3 sheetTopNormal() {
    return vec3(0.0, 1.0, 0.0);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;

    // Camera: more top-down
    vec3 ro = vec3(0.0, 6.5, 0.0);        // raise camera
    vec3 lookAt = vec3(0.0, 1.0, 6.0);    // center of sheet/domes
    vec3 forward = normalize(lookAt - ro);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = cross(right, forward);

    float fov = 0.75; // smaller = zoom in
    vec3 rd = normalize(forward + uv.x * right * fov + uv.y * up * fov);

    float d = RayMarch(ro, rd);

    vec3 col = vec3(0.0);
    vec3 lightPos = vec3(0.0, 6.0, 6.0);

    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;

        // Determine which paraboloid (if any) contributes most to the minimum
        // and get its blend weight 'w' so we can blend normals smoothly.
        float dSheetRaw = dBox(p - SHEET_CENTER, SHEET_HALF_SIZE);
        float a = PAR_H / (PAR_RBASE * PAR_RBASE);

        float minS = 1e6;
        float minW = 0.0;
        vec3 chosenLocalP = vec3(0.0);

        float sheetTopY = SHEET_CENTER.y + SHEET_HALF_THICKNESS;

        for (int i = 0; i < 5; i++) {
            float x = STARTX + SPACING * float(i);
            vec3 basePos = vec3(x, sheetTopY, ZPOS);
            vec3 lp = p - basePos;
            float dp = sdParaboloidInverted(lp, a, PAR_H);
            float w;
            float s = smin_blend(dp, dSheetRaw, SMOOTH_K, w);
            if (s < minS) {
                minS = s;
                minW = w;
                chosenLocalP = lp;
            }
        }

        // Analytic paraboloid normal (local), and sheet top normal
        vec3 nPar = paraboloidNormalAnalytic(chosenLocalP, a);
        vec3 nSheet = sheetTopNormal();

        // Blend normals by the same smooth-min weight (w): 0 -> sheet, 1 -> paraboloid
        vec3 n = normalize(mix(nSheet, nPar, min(minW, 1.0)));

        // lighting: ambient + diffuse + specular
        vec3 l = normalize(lightPos - p);
        float dif = clamp(dot(n, l), 0.0, 1.0);
        float ambient = 0.18;

        // Blinn-style specular
        vec3 viewDir = normalize(ro - p);
        vec3 halfVec = normalize(l + viewDir);
        float spec = pow(max(dot(n, halfVec), 0.0), 64.0);

        // unified material shading (same for sheet + bells)
        vec3 lit = BASE_COLOR * (ambient + dif * 0.86);
        lit += vec3(1.0) * spec * 0.6;

        // slight rim/height-driven tint to help silhouette read (very subtle)
        float heightTint = clamp((p.y - SHEET_Y) / (2.0 * PAR_H), 0.0, 1.0);
        vec3 tint = mix(vec3(0.98), vec3(0.92), heightTint) * 0.02; // tiny effect
        col = pow(lit + tint, vec3(1.0 / 2.2));
    } else {
        // background sky
        col = vec3(0.02, 0.04, 0.08) + 0.3 * vec3(0.6, 0.7, 0.9) * (1.0 - rd.y);
    }

    gl_FragColor = vec4(col, 1.0);
}




#ifdef GL_ES
precision mediump float;
#endif

#define MAX_STEPS 100
#define MAX_DIST 100.
#define SURF_DIST .001

#define PAR_COUNT 5

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse; // optional

// per-paraboloid uniforms (position, height, base radius)
uniform vec3  u_parPos[PAR_COUNT]; // world-space base positions (use .y if you want non-sheet y)
uniform float u_parH[PAR_COUNT];   // heights (set 0 to disable)
uniform float u_parR[PAR_COUNT];   // base radii at y=0

// optional global fallback controls (kept for compatibility)
uniform float u_m;       // optional global maximum height (fallback)
uniform float u_period;  // optional anim period (not used when per-pars supplied)

// helpers
float dot2(vec2 v) { return dot(v, v); }

// Small helper: generate thin anti-aliased grid line value [0..1] for given world (or local) pos.xy
// NOTE: 'pixelSize' should be the estimated world-space size of one pixel at the surface point.
float meshLine(vec2 pos, float cell, float lineWidth, float pixelSize) {
    // distance to nearest grid line along each axis (in world units)
    vec2 f = fract(pos / cell);
    float dx = min(f.x, 1.0 - f.x) * cell;
    float dy = min(f.y, 1.0 - f.y) * cell;
    float d = min(dx, dy);

    // anti-aliasing: use estimated pixel size in world units instead of fwidth
    float af = max(pixelSize, 1e-6);

    // smoothstep for line (1 at center, 0 away)
    float t = smoothstep(lineWidth + af, lineWidth, d);
    return t;
}

// axis-aligned box SDF (finite box)
float dBox(vec3 p, vec3 s) {
    return length(max(abs(p) - s, 0.));
}

// Inverted Paraboloid SDF (finite "bell" that opens downward):
// Surface: y = h - a*r^2  for 0 <= y <= h  (apex at y=h, rim at y=0, r=r_base).
float sdParaboloidInverted(vec3 p, float a, float h) {
    float r = length(p.xz);
    // lateral implicit: g = p.y - h + a*r^2
    float g = p.y - h + a * r * r;
    // gradient magnitude of g wrt (y,r): sqrt(1 + (dg/dr)^2) with dg/dr = 2*a*r
    float denom = sqrt(1.0 + 4.0 * a * a * r * r);
    float sd_lateral = g / denom;    // signed distance to lateral surface
    float sd_top = p.y - h;          // distance to top plane (negative below top)
    float sd_bottom = -p.y;          // distance to bottom plane y=0 (negative above bottom)
    // intersection of half-spaces => use max
    return max(sd_lateral, max(sd_top, sd_bottom));
}

// Smooth minimum (blend variant).
// Returns a smooth-min between `a` and `b` using smoothing width `k`.
// Also outputs the blend weight `w` (0 -> result is b (sheet), 1 -> result is a (paraboloid)).
float smin_blend(float a, float b, float k, out float w) {
    k = max(k, 1e-6);
    w = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, w) - k * w * (1.0 - w);
}

// Analytic normal for inverted paraboloid local point (p in paraboloid local space).
// For surface g = p.y - h + a*(x^2 + z^2) = 0, gradient is (2a*x, 1, 2a*z)
vec3 paraboloidNormalAnalytic(vec3 lp, float a) {
    vec3 g = vec3(2.0 * a * lp.x, 1.0, 2.0 * a * lp.z);
    return normalize(g);
}

// Scene constants (original shape baseline values)
const float SHEET_Y = 1.0;
const float SHEET_HALF_THICKNESS = 0.02;
const vec3 SHEET_CENTER = vec3(0.0, SHEET_Y, 6.0);
// small sheet (half-sizes)
const vec3 SHEET_HALF_SIZE = vec3(4.0, SHEET_HALF_THICKNESS, 3.0);

// ORIGINAL paraboloid params used to preserve shape ratio when animating (kept for reference)
const float PAR_H0 = 1.4;
const float PAR_RBASE0 = 0.8;

// smoothing radius between each paraboloid and the sheet (tweak to taste)
const float SMOOTH_K = 0.09;

// unified material color (sheet baseline)
const vec3 BASE_COLOR = vec3(0.15, 0.2, 0.24);

// Mesh overlay tuning (very small cell + thin lines)
const float MESH_CELL = 0.04;
const float MESH_LINE_WIDTH = 0.0025;
const float MESH_STRENGTH = 0.88;
const vec3  MESH_COLOR = vec3(0.18, 0.45, 0.95);

// Default fallbacks
const float DEFAULT_M = PAR_H0;
const float DEFAULT_PERIOD = 4.0;

// small epsilon to consider paraboloid off
const float PAR_EPS = 1e-3;

// Scene SDF: use per-paraboloid uniforms
float GetDist(vec3 p) {
    // sheet (finite rectangular thin box)
    float dSheetBox = dBox(p - SHEET_CENTER, SHEET_HALF_SIZE);
    float d = dSheetBox;

    // sheet top Y (where paraboloid rim usually sits)
    float sheetTopY = SHEET_CENTER.y + SHEET_HALF_THICKNESS;

    // union with each paraboloid (smoothly), using uniforms for pos/h/r
    for (int i = 0; i < PAR_COUNT; i++) {
        float par_h = u_parH[i];
        float par_r = u_parR[i];
        // skip paraboloid if height <= eps
        if (par_h <= PAR_EPS) continue;

        // base position: use provided u_parPos[i]; if its y is near zero, assume sheet top
        vec3 basePos = u_parPos[i];
        if (abs(basePos.y) < 1e-5) basePos.y = sheetTopY; // convenience fallback

        vec3 lp = p - basePos; // local point where local y=0 is at basePos.y
        float denom = max(par_r * par_r, 1e-6);
        float a = par_h / denom;
        float dp = sdParaboloidInverted(lp, a, par_h);
        float w;
        float s = smin_blend(dp, dSheetBox, SMOOTH_K, w);
        d = min(d, s);
    }

    // backdrop
    float backdrop = p.y + 20.0;
    d = min(d, backdrop);

    return d;
}

// Ray marcher + normal via central differences on the full scene SDF
float RayMarch(vec3 ro, vec3 rd) {
    float dO = 0.;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = GetDist(p);
        dO += dS;
        if (dO > MAX_DIST || dS < SURF_DIST) break;
    }
    return dO;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;

    // Camera
    vec3 ro = vec3(0.0, 6.5, 0.0);
    vec3 lookAt = vec3(0.0, 1.0, 6.0);
    vec3 forward = normalize(lookAt - ro);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = cross(right, forward);

    float fov = 0.75;
    vec3 rd = normalize(forward + uv.x * right * fov + uv.y * up * fov);

    float d = RayMarch(ro, rd);

    vec3 col = vec3(0.0);
    vec3 lightPos = vec3(0.0, 6.0, 6.0);

    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;

        // sheet top Y
        float sheetTopY = SHEET_CENTER.y + SHEET_HALF_THICKNESS;

        // Find which paraboloid (if any) contributed most and record its params
        float dSheetRaw = dBox(p - SHEET_CENTER, SHEET_HALF_SIZE);

        float minS = 1e6;
        float minW = 0.0;
        vec3 chosenLocalP = vec3(0.0);
        float chosenParH = 0.0;
        float chosenParR = 0.0;
        vec3 chosenBasePos = vec3(0.0);

        for (int i = 0; i < PAR_COUNT; i++) {
            float par_h = u_parH[i];
            float par_r = u_parR[i];
            if (par_h <= PAR_EPS) continue;

            vec3 basePos = u_parPos[i];
            if (abs(basePos.y) < 1e-5) basePos.y = sheetTopY;
            vec3 lp = p - basePos;
            float denom = max(par_r * par_r, 1e-6);
            float a = par_h / denom;
            float dp = sdParaboloidInverted(lp, a, par_h);
            float w;
            float s = smin_blend(dp, dSheetRaw, SMOOTH_K, w);
            if (s < minS) {
                minS = s;
                minW = w;
                chosenLocalP = lp;
                chosenParH = par_h;
                chosenParR = par_r;
                chosenBasePos = basePos;
            }
        }

        // analytic normals
        float denomChosen = max(chosenParR * chosenParR, 1e-6);
        float aChosen = (chosenParH > PAR_EPS) ? chosenParH / denomChosen : 0.0;
        vec3 nPar = paraboloidNormalAnalytic(chosenLocalP, aChosen);
        vec3 nSheet = vec3(0.0, 1.0, 0.0);

        vec3 n;
        if (chosenParH > PAR_EPS) {
            n = normalize(mix(nSheet, nPar, min(minW, 1.0)));
        } else {
            n = nSheet; // force flat sheet normal if no paraboloids active
        }

        // lighting
        vec3 l = normalize(lightPos - p);
        float dif = clamp(dot(n, l), 0.0, 1.0);
        float ambient = 0.18;

        // -------- dynamic paraboloid-only color ----------
        // compute colorFactor from chosen paraboloid height relative to either u_m or DEFAULT_M
        float topRef = (u_m > 1e-6) ? u_m : DEFAULT_M;
        float colorFactor = (topRef > 1e-6 && chosenParH > 0.0) ? clamp(chosenParH / topRef, 0.0, 1.0) : 0.0;
        vec3 warmOrange = vec3(1.0, 0.6, 0.2);
        float blendAmt = smoothstep(0.0, 1.0, colorFactor);
        vec3 dynamicParColor = mix(BASE_COLOR, warmOrange, blendAmt * 0.9);
        dynamicParColor += vec3(0.04) * blendAmt;

        // blend base color between sheet and paraboloid color using geometry weight
        float geoW = min(minW, 1.0);
        vec3 blendedBase = mix(BASE_COLOR, dynamicParColor, geoW);

        // specular: stronger on paraboloid only
        vec3 viewDir = normalize(ro - p);
        vec3 halfVec = normalize(l + viewDir);
        float specPow = 64.0;
        float specStrengthPar = mix(0.6, 1.0, blendAmt * 0.6);
        float specStrength = mix(0.6, specStrengthPar, geoW);
        float spec = pow(max(dot(n, halfVec), 0.0), specPow) * specStrength;

        // final lit
        vec3 lit = blendedBase * (ambient + dif * 0.86);
        lit += vec3(1.0) * spec;

        // slight paraboloid-weighted tint
        float heightDenom = max(2.0 * chosenParH, 1e-6);
        float heightTint = (chosenParH > 1e-6) ? clamp((p.y - SHEET_Y) / heightDenom, 0.0, 1.0) : 0.0;
        vec3 tint = mix(vec3(0.98), vec3(0.92), heightTint) * 0.02 * geoW;

        col = pow(lit + tint, vec3(1.0 / 2.2));

        // -------------------------
        // Mesh overlay (blended, blue)
        // -------------------------
        float distToCam = length(ro - p);
        float pixelWorldSize = (fov * distToCam) / u_resolution.y;
        float sheetMesh = meshLine(p.xz, MESH_CELL, MESH_LINE_WIDTH, pixelWorldSize);
        float paraMesh  = meshLine(chosenLocalP.xz, MESH_CELL, MESH_LINE_WIDTH, pixelWorldSize);
        float meshVal = mix(sheetMesh, paraMesh, geoW);
        col = mix(col, MESH_COLOR, meshVal * MESH_STRENGTH);

        // -------------------------
        // Make everything outside the sheet footprint black
        // -------------------------
        vec3 localXZ = p - SHEET_CENTER;
        if (abs(localXZ.x) > SHEET_HALF_SIZE.x || abs(localXZ.z) > SHEET_HALF_SIZE.z) {
            col = vec3(0.0);
        }

    } else {
        // background outside the sheet -> black
        col = vec3(0.0);
    }

    gl_FragColor = vec4(col, 1.0);
}
