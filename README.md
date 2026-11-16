# pdp7-teletype

Papírový dálnopis **Teletype Model 33** v prohlížeči jako terminál pro **PDP-7 Unix v0**
(první Unix z roku 1969, oživený projektem [pdp7-unix](https://github.com/DoctorWkt/pdp7-unix)).

Místo terminálového okna se text tiskne na roli papíru: jen velká písmena, 72 znaků na řádek,
rychlost **10 znaků za sekundu**, nerovnoměrné údery, rozpitá barva, přítlačná tyč, typový
válec a zvuky stroje.

*A paper-roll Teletype Model 33 in your browser, as the console for PDP-7 Unix v0 running in SIMH.*

## Jak to funguje

```
prohlížeč (index.html)  ⇄  teletype.py (HTTP + SSE, 127.0.0.1:8033)  ⇄  SIMH pdp7 (telnet konzole)
```

`teletype.py` spustí simulátor SIMH s konzolí na telnetu, připojí se k ní a výstup posílá
stránce. Používá jen standardní knihovnu Pythonu a poslouchá jen na `127.0.0.1`.

## Požadavky

- Python 3
- simulátor PDP-7 z [Open SIMH](https://github.com/open-simh/simh) (`make pdp7`; na 64bitových systémech
  doporučuje pdp7-unix `OPTIMIZE=-O1`)
- sestavený [pdp7-unix](https://github.com/DoctorWkt/pdp7-unix) (`make`, potřebuje Perl s modulem DateTime;
  s GCC 15+ je potřeba `make CCARGS="-std=gnu89 -Wno-multichar -Wno-implicit"`)

Výchozí cesty jsou `~/Applications/simh/BIN/pdp7` a `~/Applications/pdp7-unix/build`,
jiné nastavíš proměnnými:

```sh
SIMH_PDP7=/cesta/k/pdp7 PDP7_UNIX_BUILD=/cesta/k/pdp7-unix/build python3 teletype.py
```

## Spuštění

```sh
python3 teletype.py            # otevře http://127.0.0.1:8033
python3 teletype.py --no-browser
```

Klikni na **ZAPNOUT DÁLNOPIS** (prohlížeč pustí zvuk až po kliknutí) a přihlas se `ken` / `ken`
(další účty: `dmr`, `doug`, heslo stejné jako jméno).

Při prvním spuštění se vytvoří vlastní kopie disku v `disk/`, takže původní `image.fs`
zůstane nedotčený. Při ukončení (`Ctrl+C`) se disk uloží.

| Ovládání | |
|---|---|
| F5 / **Turbo** | rychlý tisk |
| F7 / **Víko** | ztišit stroj |
| F8 | vyzkoušet další zvuk návratu vozíku (jen s vlastními vzorky) |
| **Utrhnout papír** | začít s čistým papírem |
| **Restart počítače** | vypnout a zapnout PDP-7 (když se Unix zasekne) |
| Backspace | pošle `#`, kterým se ve v0 maže předchozí znak |

## Tipy k Unixu v0

- `ch dir` místo `cd`, `ch dd` = kořenový adresář, `..` znamená *tento* adresář
- programy jsou ve složce `system`; příkazy fungují jen ve složce, kam smíš zapisovat
- `ed` je jediný editor; `b` (jazyk B) a `as` umí přeložit `hello.b`
- nespouštěj `n.out` – je to tabulka symbolů, ne program, a zasekne celý počítač

## Zvuky

Zvuky stroje se syntetizují přímo v prohlížeči. Pokud do složky `sounds/` dáš vlastní nahrávky
(`strike_*.wav` pro údery, `cr_*.wav` pro návrat vozíku, `motor.wav` pro smyčku motoru),
použijí se místo nich. Nahrávky nejsou součástí repozitáře.

## Licence

Kód tohoto projektu: [GPL-3.0-or-later](LICENSE).
PDP-7 Unix a SIMH v repozitáři nejsou – mají vlastní licence (zdrojové kódy Unixu © Micro Focus).
