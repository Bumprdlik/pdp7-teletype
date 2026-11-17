// How the page talks to the PDP-7. web/build.sh writes its own copy of this file into web/dist:
// STATIC_BUILD = true runs the PDP-7 in this browser (SIMH compiled to WebAssembly, in a Web
// Worker) instead of behind teletype.py, and BUILD is the commit id shown in the menu.
export const STATIC_BUILD = false;
export const BUILD = "dev";
