/* Glue between the SIMH PDP-7 simulator and the browser (Emscripten + Asyncify).

   SIMH runs as an ordinary blocking program inside a Web Worker. Every few
   milliseconds it yields to the browser (emscripten_sleep), so the worker can
   receive key presses, send printed characters to the page and save the disk.
   The JavaScript side lives in pdp7-worker.js. */

#include <emscripten.h>
#include <stddef.h>
#include "sim_defs.h"

#define YIELD_MS 15.0          /* run the simulator at most this long without yielding */

static double last_yield;

EM_JS(int, js_getkey, (void), { return Module.keyQueue.length ? Module.keyQueue.shift() : -1; });
EM_JS(int, js_key_waiting, (void), { return Module.keyQueue.length; });
EM_JS(void, js_putchar, (int c), { Module.outBuf.push(c); });
EM_JS(void, js_flush, (void), { Module.flushOutput(); });

static void yield_now (unsigned int ms)
{
js_flush ();
emscripten_sleep (ms);
last_yield = emscripten_get_now ();
}

static void maybe_yield (void)
{
if (emscripten_get_now () - last_yield >= YIELD_MS)
    yield_now (0);
}

int web_getkey (void)
{
maybe_yield ();
return js_getkey ();
}

void web_putchar (int c)
{
js_putchar (c);
}

int web_key_ready (int ms_timeout)
{
if (!js_key_waiting ())
    yield_now (ms_timeout > 0 ? (unsigned int) ms_timeout : 0);
return js_key_waiting ();
}

void web_sleep (unsigned int ms)
{
yield_now (ms);
}

/* The RB09 disk is kept entirely in memory (UNIT_MUSTBUF); JavaScript copies it
   out of the wasm heap to save it in IndexedDB. */

static UNIT *rb_unit_ptr (void)
{
DEVICE *dptr = find_dev ("RB");

if (dptr == NULL || (dptr->units[0].flags & UNIT_BUF) == 0)
    return NULL;
return &dptr->units[0];
}

EMSCRIPTEN_KEEPALIVE void *web_disk_ptr (void)
{
UNIT *u = rb_unit_ptr ();

return u ? u->filebuf : NULL;
}

EMSCRIPTEN_KEEPALIVE int web_disk_bytes (void)
{
UNIT *u = rb_unit_ptr ();

return u ? (int) (u->capac * sizeof (int32)) : 0;
}
