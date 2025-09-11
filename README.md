# Modern OpenGL Interactive Circles

This project renders two interactive blue circles using modern OpenGL with GLEW on Windows. You can drag circles with the mouse, toggle animation, and reset positions.

## Files

- `modern_opengl.cpp` – Windows app creating an OpenGL context and rendering a full-screen quad
- `modern_vertex.glsl` – Vertex shader (passes positions to fragment shader)
- `modern_fragment.glsl` – Fragment shader (draws two blue circles via uniforms)
- `CMakeLists.txt` – CMake build targeting `modern_opengl`

## Controls

- Left mouse: drag a circle
- SPACE: toggle auto animation
- ENTER: reset positions
- ESC: exit

## Prerequisites (Windows)

- OpenGL-capable GPU and drivers
- GLEW (bundled under `glew-2.2.0/`)
- CMake 3.10+
- One of:
  - Visual Studio Build Tools (MSVC)
  - Ninja + a C++ toolchain (MSVC/Clang/MinGW)

## Build

Generate build files (choose a generator you have installed):

Visual Studio (x64):
```bash
cmake -S . -B build_vs -G "Visual Studio 17 2022" -A x64 -DGLEW_INCLUDE_DIR="%cd%/glew-2.2.0/include" -DGLEW_LIBRARY="%cd%/glew-2.2.0/lib/Release/x64/glew32.lib"
cmake --build build_vs --config Release --target modern_opengl
```

Ninja (requires Ninja and a compiler on PATH):
```bash
cmake -S . -B build -G Ninja -DGLEW_INCLUDE_DIR="%cd%/glew-2.2.0/include" -DGLEW_LIBRARY="%cd%/glew-2.2.0/lib/Release/x64/glew32.lib"
cmake --build build --config Release --target modern_opengl
```

## Run

From the project root (shaders must be next to the executable or copied to the build folder):
```bash
./modern_opengl.exe
```

## Notes

- The app loads `modern_vertex.glsl` and `modern_fragment.glsl` from the working directory.
- If the executable can't find `glew32.dll`, place it next to `modern_opengl.exe` or add its folder to PATH.
