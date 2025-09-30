#ifdef GL_ES
precision mediump float;
#endif

// ------------------- utility SDFs -------------------
float sdSegment(vec2 p, vec2 a, vec2 b){
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float sdConvexPolygon(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3){
    vec2 verts[4];
    verts[0] = v0; verts[1] = v1; verts[2] = v2; verts[3] = v3;
    float maxHalfPlane = -1e9;
    for(int i=0;i<4;i++){
        vec2 a = verts[i];
        vec2 b = verts[(i+1)%4];
        vec2 e = b - a;
        vec2 n = normalize(vec2(e.y, -e.x)); // inward for CCW
        float d = dot(p - a, n);
        maxHalfPlane = max(maxHalfPlane, d);
    }
    if(maxHalfPlane <= 0.0) return maxHalfPlane;
    float mind = 1e9;
    for(int i=0;i<4;i++){
        vec2 a = verts[i];
        vec2 b = verts[(i+1)%4];
        mind = min(mind, sdSegment(p, a, b));
    }
    return mind;
}

// Upside-down parabola SDF (bottom at y=0, apex at (0,H))
float sdVerticalParabolaDown(vec2 p, float R, float H){
    if(R <= 1e-4) return length(p - vec2(0.0, H));
    float a = H/(R*R);
    if(p.y > H) return length(p - vec2(0.0, H));
    if(p.y < 0.0){
        if(abs(p.x) <= R) return -p.y;
        return length(vec2(abs(p.x) - R, -p.y));
    }
    float F = p.y - H + a*p.x*p.x;
    float gmag = sqrt((2.0*a*p.x)*(2.0*a*p.x) + 1.0);
    float d_parab = F / gmag;
    float d_bottom = -p.y;
    float insideSDF = max(d_parab, d_bottom);
    if(insideSDF <= 0.0) return insideSDF;
    return d_parab;
}

// smooth union
float smin(float a, float b, float k){
    float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0);
    return mix(b, a, h) - k*h*(1.0 - h);
}

// ------------------- mapping helpers -------------------
vec2 mapNormalizedToTrapezium(vec2 npos, float topY, float bottomY, float topHalfW, float bottomHalfW){
    float fy = clamp(npos.y, 0.0, 1.0);
    float wy = mix(topY, bottomY, fy);
    float halfW = mix(topHalfW, bottomHalfW, fy);
    float wx = clamp(npos.x, -1.0, 1.0) * halfW;
    return vec2(wx, wy);
}

// ------------------- adjustable positions (edit these) -------------------
const int M = 5;
const vec2 parabPos[M] = vec2[](
    vec2(-0.9, 0.0),
    vec2(-0.4, 0.12),
    vec2(-0.05, 0.25),
    vec2(0.18, 0.05),
    vec2(0.0, 0.8)
);

// ------------------- main rendering -------------------
void mainImage(out vec4 fragColor, in vec2 fragCoord){
    // NDC + aspect correction
    vec2 uv = (fragCoord.xy / iResolution.xy) * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;
    // world scale/offset
    vec2 p = uv * vec2(1.9, 2.6) + vec2(0.0, -0.05);

    // trapezium geometry
    float topY = -0.05;
    float bottomY = -1.55;
    float topHalfW = 2.45;
    float bottomHalfW = 3.35;
    vec2 v0 = vec2(-topHalfW, topY);
    vec2 v1 = vec2( topHalfW, topY);
    vec2 v2 = vec2( bottomHalfW, bottomY);
    vec2 v3 = vec2(-bottomHalfW, bottomY);

    float dSheet = sdConvexPolygon(p, v0, v1, v2, v3);

    // AA (pixel-scale) - used only for soft edges, not for main masks
    float aa = 1.0 / min(iResolution.x, iResolution.y) * 1.8;

    // background
    vec3 bg = vec3(0.94, 0.95, 0.96);

    // placement params
    float speed = 1.0;
    float phaseStep = 1.2;
    float Rmax = 0.46;
    float Hmax = 0.95;
    float blendK = 0.055;

    // combined SDF initialised to sheet
    float combined = dSheet;

    // accumulators for sheet coloring
    vec3 sheetColorFromGauss = vec3(0.0);
    float gaussWeight = 0.0;

    vec3 sheetColorFromInside = vec3(0.0);
    float insideCount = 0.0;

    // We'll also store per-parabola data for top-layer rendering
    // (we can't create arrays of dynamic size easily, but M is small; we re-compute later)
    // accumulate a visible cover strength (0..M) for blending
    float coverAcc = 0.0;

    // First pass: accumulate sheet-influencing color + union SDF
    for(int i=0;i<M;i++){
        vec2 basePoint = mapNormalizedToTrapezium(parabPos[i], topY, bottomY, topHalfW, bottomHalfW);

        // animation (R & H)
        float phase = float(i) * phaseStep;
        float t = abs(sin(iTime * speed + phase));
        float ease = smoothstep(0.0, 1.0, t);
        float Ri = Rmax * ease;
        float Hi = Hmax * ease;

        // parabola SDF in world coords (bottom at basePoint)
        vec2 p_par = p - basePoint;
        float dParab = sdVerticalParabolaDown(p_par, Ri, Hi);

        // smooth-union with sheet (parabola melds into sheet)
        combined = smin(combined, dParab, blendK);

        // color representative for this parabola (boosted for visibility)
        float hueShift = float(i) * 0.04;
        vec3 base = vec3(0.06 + hueShift, 0.18 + hueShift*0.2, 0.42 + hueShift*0.4);
        vec3 bright = vec3(0.20 + hueShift, 0.62 + hueShift*0.2, 1.0 + hueShift*0.4);
        vec3 rep = mix(base, bright, 0.7);
        rep *= 1.18; // extra saturation/brightness to ensure visibility

        // GAUSSIAN SPREAD contribution (broad, ensures sheet gets visible color even if SDF edges are tiny)
        float dist = length(p_par);
        float spread = 0.6; // intentionally large so color spreads across sheet
        float w = exp(-(dist*dist) / (spread*spread));
        w *= ease * 1.6;
        sheetColorFromGauss += rep * w;
        gaussWeight += w;

        // INSIDE-MASK contribution (precise): 1 inside parabola, 0 outside (soft edge via aa)
        float insideMask = smoothstep(-aa*2.0, aa*2.0, -dParab); // edge0 < edge1
        insideMask *= ease;
        sheetColorFromInside += rep * insideMask;
        insideCount += insideMask;

        // cover accumulation (stronger near center)
        float cover = 1.0 - smoothstep(0.0, spread, dist);
        cover *= ease;
        coverAcc += cover;
    }

    // compute sheet-derived colors
    vec3 gaussAvg = (gaussWeight > 1e-5) ? sheetColorFromGauss / gaussWeight : vec3(0.16,0.42,0.78);
    vec3 insideAvg = (insideCount > 1e-5) ? sheetColorFromInside / insideCount : vec3(0.0);

    // combine both contributions: prefer precise insideAvg where there is direct coverage,
    // but fallback to broader gaussAvg to show color bleed.
    float insideStrength = clamp(insideCount, 0.0, 1.0); // 0..1
    float gaussStrength = clamp(gaussWeight * 0.8, 0.0, 1.0);
    vec3 sheetDerived = mix(gaussAvg, insideAvg, insideStrength);

    // Build final sheet base color: mix between a neutral fallback and the derived color.
    vec3 fallbackSheet = vec3(0.16,0.42,0.78);
    // map coverAcc (0..M) into 0..1 and amplify
    float coverFactor = clamp(coverAcc * 0.45, 0.0, 1.0);
    // give precedence to derived color where cover is strong
    vec3 sheetBaseColor = mix(fallbackSheet, sheetDerived, max(coverFactor, gaussStrength));

    // Slight stylistic tweak to keep some original shading feel
    sheetBaseColor = mix(sheetBaseColor * 0.78 + vec3(0.12), sheetBaseColor, 0.6);

    // Now render final body: sheet+parabolas combined.
    // Use a robust inside test for trapezium and combined shapes.
    float sheetInsideExact = step(0.0, -dSheet);         // crisp trapezium interior
    float combinedInsideExact = step(0.0, -combined);   // crisp combined interior (sheet+parabolas)
    // soft masks for edges
    float sheetSoft = smoothstep(-aa*4.0, aa*4.0, -dSheet);
    float combinedSoft = smoothstep(-aa*4.0, aa*4.0, -combined);

    // lighting gradient across sheet
    float vgrad = clamp((p.y - bottomY) / (topY - bottomY), 0.0, 1.0);
    vec3 light = mix(vec3(1.06), vec3(0.84), 1.0 - vgrad);

    // base canvas
    vec3 col = bg;

    // body for sheet (apply only inside combined so parabolas union in)
    vec3 body = sheetBaseColor * light;
    col = mix(col, body, combinedSoft);

    // Second pass: draw parabolas on top with stronger, distinct color
    for(int i=0;i<M;i++){
        vec2 basePoint = mapNormalizedToTrapezium(parabPos[i], topY, bottomY, topHalfW, bottomHalfW);

        // animation (R & H) - same as before
        float phase = float(i) * phaseStep;
        float t = abs(sin(iTime * speed + phase));
        float ease = smoothstep(0.0, 1.0, t);
        float Ri = Rmax * ease;
        float Hi = Hmax * ease;

        vec2 p_par = p - basePoint;
        float dParab = sdVerticalParabolaDown(p_par, Ri, Hi);

        // recompute representative color with same formula (ensure consistent look)
        float hueShift = float(i) * 0.04;
        vec3 base = vec3(0.06 + hueShift, 0.18 + hueShift*0.2, 0.42 + hueShift*0.4);
        vec3 bright = vec3(0.20 + hueShift, 0.62 + hueShift*0.2, 1.0 + hueShift*0.4);
        vec3 rep = mix(base, bright, 0.7) * 1.18;

        // inside mask for parabola body (soft)
        float fillMask = smoothstep(-aa*2.0, aa*2.0, -dParab); // 1 inside, 0 outside
        fillMask *= ease;

        // draw the parabola body color onto col with strong opacity so parabolas remain visible
        // use a slightly brighter/light-modulated color for parabola body
        vec3 parabLight = mix(vec3(1.02), vec3(0.92), 1.0 - clamp((p_par.y - (-Ri)) / (Hi + 0.0001), 0.0, 1.0));
        vec3 parabBody = rep * parabLight;
        col = mix(col, parabBody, fillMask * 0.98);

        // inner shade for depth (darker inside)
        float innerShade = (1.0 - smoothstep(-0.12, 0.0, dParab)) * 0.12 * ease;
        col -= innerShade * 0.6;

        // apex spec (bright spot near apex)
        float apexDist = length(vec2(p_par.x*1.6, p_par.y - Hi));
        float apexSpec = pow(clamp(1.0 - apexDist*1.0, 0.0, 1.0), 14.0) * fillMask * ease;
        col += apexSpec * 0.18;

        // outline / rim: visible, thin
        float outlineP = 1.0 - smoothstep(0.0, aa*1.6, abs(dParab));
        col = mix(col, vec3(0.03,0.05,0.07), outlineP * 0.5);
    }

    // final subtle global outline from combined SDF
    float outline = 1.0 - smoothstep(0.0, aa*2.2, abs(combined));
    col = mix(col, col * 0.20, outline * 0.85);

    // grain only on sheet region (crisp)
    float sheetMask = step(0.0, -dSheet);
    float grain = (fract(sin(dot(p * 43.21, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
    col += grain * 0.045 * sheetMask;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
