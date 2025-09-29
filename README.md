# Variable Swapper BETA 🔄

Hvis du har importert komponenter fra et eksternt bibliotek og ønsker å koble variablene til ditt lokale bibliotek i stedet, kan du bruke denne pluginen til å automatisk bytte variabler basert på navn.

⚠️ Denne pluginen fungerer med alle typer variabler (farger, størrelser, typografi, border-radius, border-width) og text styles. Den matcher variabler basert på navn mellom eksterne og lokale biblioteker.

## Hvordan bruke

1. **Åpne pluginen** og velg en komponent eller komponent-set du vil analysere
2. **Klikk "Analyser valgt komponent"** for å finne variabler som kan byttes
3. **Se oppsummeringen** som viser hvor mange variabler som kan byttes til lokale variabler
4. **Klikk "Bytt alle variabler"** for å koble til lokale variabler
5. 🎉 Nå er variablene koblet til ditt lokale bibliotek!

## Funksjoner

* **Støtter alle variabeltyper** - Farger, størrelser, typografi, border-radius, border-width
* **Text style støtte** - Bytter også text styles til lokale versjoner
* **ComponentSet støtte** - Analyserer alle varianter i en komponent-set
* **Smart matching** - Matcher variabler basert på navn mellom biblioteker
* **Enkel brukeropplevelse** - Kun to klikk for å bytte alle variabler

## Hvordan installere

1. Last ned denne repo-en
2. Bruk "Import plugin from manifest..." i Figma og velg `manifest.json`
3. Nå kan du finne pluginen i Figma under Plugins

## Krav

Din Figma-fil må ha:

* **Lokale variabler** har samme struktur som designsystemets Figma fil
* **Lokale text styles** har samme navn som i vår
* **Komponenter** som bruker variabler fra eksterne biblioteker

## Hvordan det fungerer

1. **Analyse**: Pluginen går gjennom alle noder i den valgte komponenten og finner variabler som er koblet til eksterne biblioteker
2. **Matching**: Den matcher disse variablene med lokale variabler basert på navn
3. **Bytting**: Den bytter koblingene fra eksterne til lokale variabler

## Støttede variabeltyper

* **Farger** - `fills`, `strokes`, `fills[0].color`, `strokes[0].color`
* **Størrelser** - `width`, `height`, `paddingTop`, `paddingBottom`, etc.
* **Typografi** - `fontSize`, `fontFamily`, `fontWeight`, `lineHeight`, etc.
* **Border** - `cornerRadius`, `strokeWeight`
* **Text styles** - Komplette text style koblinger

## Feilsøking

### Vanlige problemer

**Hvis pluginen ikke finner noen variabler å bytte:**
* Sjekk at du har lokale variabler med samme navn
* Sjekk at komponenten faktisk bruker variabler (ikke hardkodede verdier)
* Sjekk at variablene kommer fra et eksternt bibliotek

**Hvis du får feilmeldinger under bytting:**

* **"Variabel kan ikke overstyres i instans (ikke eksponert)"** - Dette skjer når en variabel er bundet inne i en base-komponent og ikke eksponert for instans-overstyring. Løsning: Åpne hovedkomponenten og eksponer variabelen/egenskapen for instanser, eller flytt bindingen til et sted der den kan overstyres.

* **"Ingen lokal variabel funnet for: [navn]"** - Det finnes ingen lokal variabel med samme navn. Løsning: Opprett en lokal variabel med samme navn, eller sjekk at navnet stemmer.

* **"Kunne ikke finne node for variabel"** - Pluginen kan ikke finne noden som bruker variabelen. Dette kan skje hvis komponenten har endret seg. Løsning: Prøv å analysere komponenten på nytt.

### Feilhåndtering

Pluginen grupperer like feilmeldinger for å gi en oversiktlig oppsummering. I stedet for å vise "8× samme feilmelding" vises det som "8× [feilmelding]".

Gi beskjed hvis du finner bugs eller andre problemer!

## Om

En Figma plugin for å automatisk bytte variabler på importerte komponenter til lokale variabler basert på navn-matching.