cmake_minimum_required(VERSION 3.25)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)
find_package(cmake-cargo REQUIRED PATHS node_modules/cmake-cargo)
find_package(cmake-napi REQUIRED PATHS node_modules/cmake-napi)

project(bare_ripgrep C)

add_crate("Cargo.toml")

add_bare_module(bare_ripgrep_bare)

target_sources(
  ${bare_ripgrep_bare}
  PRIVATE
    binding.c
)

target_link_libraries(
  ${bare_ripgrep_bare}
  PRIVATE
    ripgrep_native
)

add_napi_module(bare_ripgrep_napi)

target_sources(
  ${bare_ripgrep_napi}
  PRIVATE
    binding.c
)

target_compile_definitions(
  ${bare_ripgrep_napi}
  PRIVATE
    NAPI_VERSION=9
)

target_link_libraries(
  ${bare_ripgrep_napi}
  PRIVATE
    ripgrep_native
)

resolve_node_module(bare-compat-napi compat)

target_include_directories(
  ${bare_ripgrep_napi}
  PRIVATE
    "${compat}/include"
)
