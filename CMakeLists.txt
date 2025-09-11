cmake_minimum_required(VERSION 3.10)
project(ModernOpenGLCircles C)

# Find OpenGL
find_package(OpenGL REQUIRED)

# GLEW: use explicit include/lib paths if provided
if (DEFINED GLEW_INCLUDE_DIR)
    include_directories(${GLEW_INCLUDE_DIR})
endif()

# Add executable (C)
add_executable(modern_opengl modern_opengl.c)
add_executable(rect_opengl rect_opengl.c)

# Link libraries
target_link_libraries(modern_opengl OpenGL::GL)

# Prefer explicit GLEW path if provided; otherwise try target
if (DEFINED GLEW_LIBRARY)
    target_link_libraries(modern_opengl ${GLEW_LIBRARY})
else()
    find_package(GLEW REQUIRED)
    target_link_libraries(modern_opengl GLEW::GLEW)
endif()

target_link_libraries(rect_opengl OpenGL::GL)
if (DEFINED GLEW_LIBRARY)
    target_link_libraries(rect_opengl ${GLEW_LIBRARY})
else()
    find_package(GLEW REQUIRED)
    target_link_libraries(rect_opengl GLEW::GLEW)
endif()

# Copy shader files to build directory
configure_file(modern_vertex.glsl ${CMAKE_BINARY_DIR}/modern_vertex.glsl COPYONLY)
configure_file(modern_fragment.glsl ${CMAKE_BINARY_DIR}/modern_fragment.glsl COPYONLY)
configure_file(other_fragment.glsl ${CMAKE_BINARY_DIR}/other_fragment.glsl COPYONLY)
configure_file(rect_fragment.glsl ${CMAKE_BINARY_DIR}/rect_fragment.glsl COPYONLY)
