# Ghicește Cuvântul

Un joc de ghicit cuvinte pentru invitații de la nuntă. Gazda pregătește o sesiune,
iar invitații joacă pe rând pe același dispozitiv: fiecare primește o descriere și
literele răspunsului amestecate, pe care le atinge ca să formeze cuvântul, contra
cronometru. La final se afișează clasamentul.

Rulează local, pe un singur laptop. Fără internet, fără bază de date, fără conturi.

---

## Pornire rapidă

```bash
npm install
npm run dev
```

Apoi deschide <http://localhost:3000>.

Pentru seara nunții folosește varianta compilată — pornește mai repede și e mai stabilă:

```bash
npm run event
```

Nu e nevoie de niciun fișier de configurare, de nicio cheie și de niciun pas de
inițializare. Întrebările sunt deja în proiect.

**Cerințe:** Node.js 20 sau mai nou (`node --version`).

---

## Cele trei ecrane

| Ecran | Adresă | Pe ce dispozitiv |
|---|---|---|
| **Consola gazdei** | `/admin` | Laptopul tău. De aici pornești turele și acorzi punctele. |
| **Ecranul jucătorului** | `/play` | Tableta pe care o dai invitatului. |
| **Ecranul invitaților** | `/display` | Laptopul (pe proiector sau pe ecranul mare). Doar afișează. |

### Montajul recomandat: laptop + tabletă

```
   TABLETA (invitatul)              LAPTOPUL (tu)
   ┌──────────────────┐             ┌──────────────────────┐
   │ descrierea       │             │ /admin — consola     │
   │ [N] [O] [E]      │  ←  Wi-Fi → │ vezi răspunsul       │
   │ atinge literele  │             │ [ ✓ CORECT ]         │
   └──────────────────┘             └──────────────────────┘
                                    ┌──────────────────────┐
                                    │ /display — proiector │
                                    │ întrebare + clasament│
                                    └──────────────────────┘
```

Invitatul joacă pe tabletă, tu rămâi la laptop cu consola, iar sala vede
întrebarea și clasamentul pe ecranul mare.

**Cum conectezi tableta:** în `/admin` apasă „Conectează tableta". Îți arată
adresa laptopului și un cod QR — îl scanezi cu tableta și se deschide direct
ecranul de joc. Tableta trebuie să fie pe aceeași rețea Wi-Fi.

Dacă tableta nu se conectează:

- **Oprește VPN-ul pe laptop.** Un VPN activ rupe legătura în rețeaua locală și
  face aplicația să afișeze o adresă greșită.
- **Permite Node.js în Windows Firewall.** La prima pornire Windows întreabă —
  alege „Allow". Dacă ai refuzat odată, trebuie șters manual regula de blocare.
- Consola marchează cu verde adresa cea mai probabil corectă și cu gri
  adaptoarele virtuale, care nu funcționează niciodată.

**Testează asta înainte de nuntă, pe rețeaua de la local.** E singurul pas care
chiar poate să nu meargă în seara respectivă.

### Merge și pe un singur dispozitiv

Dacă nu ai tabletă, deschide `/play` pe laptop și dă-l din mână în mână.
Totul funcționează identic.

---

## Cum se joacă o sesiune

1. **`/admin` → scrii numele invitaților.** Opt câmpuri sunt pregătite; adaugi sau ștergi după nevoie.
2. **Alegi categoriile.** Implicit sunt bifate toate cele 11.
3. **Verifici estimarea de durată.** Ecranul îți arată cât va dura realist, pesimist și în cel mai rău caz.
4. **Apeși „Începe sesiunea”.**
5. **Dai dispozitivul primului invitat** și apeși „Începe”.
6. **Când invitatul spune cuvântul, apeși „Corect" pe laptop.** Nu mai aștepți
   să termine de atins literele — punctajul se calculează în clipa în care a
   spus răspunsul. Poate să și termine singur pe tabletă, cum îți convine.
7. După fiecare tură apare scorul jucătorului, apoi urmează următorul.
8. La final se afișează clasamentul — și rămâne disponibil ca „sesiunea trecută”.

### Punctajul

| | Ușoară | Medie | Grea |
|---|---|---|---|
| Timp | 30s | 40s | 50s |
| Valoare de bază | 100 | 150 | 200 |
| Bonus „fără ajutor” | +10 | +15 | +20 |
| Maxim pe întrebare | 110 | 165 | 220 |

**Timpul.** Întrebarea pornește de la valoarea ei de bază și scade treptat, până
la 30% în ultima secundă. Cronometrul se rotunjește la secundă, deci cât timp
cifra de pe tabletă nu s-a schimbat, atâtea puncte se acordă — nimeni nu pierde
puncte în timpul în care gazda apasă butonul.

**Literele ajutătoare.** Fiecare literă costă partea ei din cuvânt: la un cuvânt
de 8 litere o literă ia a opta parte din cât valorează răspunsul în acel moment,
la unul de 16 litere ia a șaisprezecea. Cu cât cuvântul e mai lung, cu atât o
literă ajută mai puțin — și cu atât costă mai puțin. Prețul nu se oprește
niciodată: și a zecea literă costă ceva, așa că nu există momentul în care merită
să dezvălui tot cuvântul degeaba.

Literele se descoperă **de la stânga la dreapta**, nu la întâmplare. Așa fiecare
literă valorează la fel pentru toată lumea — altfel un invitat plătea plin
prețul pentru prima literă a cuvântului și altul, același preț, pentru un „I” din
mijloc. Ultima literă rămâne mereu a jucătorului.

**Bonusul.** Un răspuns dat fără nicio literă ajutătoare primește 10% peste
valoarea de bază. Se pierde la prima literă cerută și nu mai revine — de aceea
prima literă e cea mai scumpă. Butonul de pe tabletă arată mereu cât costă
**chiar acum** următoarea literă, bonusul pierdut inclus.

O întrebare expirată valorează 0. O tură perfectă înseamnă 880 de puncte.

Greșelile nu se penalizează — poți încerca de câte ori vrei până expiră timpul.

La egalitate de puncte, departajarea se face după numărul de cuvinte ghicite,
apoi după timpul total, apoi după numărul de încercări greșite. Literele
ajutătoare nu departajează: sunt deja plătite în punctaj, iar a le număra încă o
dată ar taxa de două ori același ajutor.

---

## În timpul jocului

Panoul gazdei rămâne util cât timp se joacă:

- **Ritm** — cât a trecut, media pe jucător și ora estimată de final. Dacă ai
  setat o oră țintă, panoul devine portocaliu când începi să întârzii.
- **Pauză** — oprește cronometrul. Ecranul jucătorului acoperă întrebarea.
- **Sari peste întrebare** — pentru o întrebare greșită sau ambiguă. Nu
  penalizează jucătorul: primește în loc altă întrebare, de aceeași dificultate
  și din aceeași clasă tematică, nefolosită de nimeni în sesiune. Tura lui
  valorează în continuare exact cât a celorlalți. Doar dacă s-au epuizat
  întrebările de rezervă tura rămâne mai scurtă.
- **Timp pe întrebare** — îl poți scurta în timpul jocului. E pârghia corectă
  dacă rămâi în urmă: punctajul se raportează la timpul fiecărei întrebări,
  deci clasamentul rămâne comparabil.
- **±10 puncte / Reia tura** — corecții manuale, dacă ceva merge prost.

### Consola de moderare

Cât timp o întrebare e activă, sus în `/admin` ai consola: descrierea,
**răspunsul corect**, cronometrul și cât valorează întrebarea chiar acum.

- **✓ Corect** — acordă punctele și trece mai departe. Apasă imediat ce
  invitatul a spus cuvântul.
- **Literă ajutătoare** — dezvăluie o literă pe ecranele tuturor, cu penalizarea
  obișnuită. O poate cere și invitatul singur, de pe tabletă.
- **Nu a ghicit** — încheie întrebarea cu zero puncte, fără să aștepți
  cronometrul.

Consola e singurul ecran care arată răspunsul. **Nu o proiecta.**

### Dacă se închide ceva

Jocul se salvează pe disc după fiecare mișcare. Dacă se închide fila, adoarme
laptopul sau pică aplicația, redeschide `/admin` și continui de unde ai rămas.

Sesiunea revine **în pauză**, cu tot timpul rămas neatins — timpul cât aplicația
a fost oprită nu se scade din cronometrul jucătorului.

---

## Întrebările

Sunt fișiere JSON obișnuite în `data/questions/`, unul pe categorie. Le poți
edita până în ultima clipă — aplicația le recitește de fiecare dată când
deschizi ecranul de pregătire.

```json
{
  "id": "geografie",
  "name": "Geografie",
  "theme": "general",
  "icon": "🌍",
  "questions": [
    {"id": "geo-001", "difficulty": "easy", "prompt": "Orașul care a devenit scaun domnesc al Țării Românești în vremea lui Vlad Țepeș.", "answer": "BUCUREȘTI"}
  ]
}
```

- `theme` este `christian` (biblic / nuntă) sau `general`.
- `difficulty` este `easy`, `medium` sau `hard`.
- Răspunsurile se scriu **cu diacritice**. Pentru litere, jocul le elimină
  automat, deci nimeni nu pierde din cauza lui `ș` față de `s`.
- Răspunsurile au între **8 și 16 litere** (spațiile nu se numără). Sub 8 sau
  peste 16 întrebarea e respinsă la încărcare și apare la `npm run check:questions`.

Ca să adaugi o categorie nouă, pui un fișier nou în folder. Nu trebuie modificat
niciun cod.

`data/questions/nunta-casatorie.json` e locul potrivit pentru câteva întrebări
personalizate despre miri.

Verifică oricând seturile:

```bash
npm run check:questions
```

Îți arată câte întrebări sunt pe categorie și dificultate, semnalează
răspunsurile duplicate și îți spune câți jucători pot juca fără repetări.

---

## Cum sunt împărțite întrebările

Toate întrebările se extrag la începutul sesiunii, echilibrat pe două axe:

- **Dificultate** — fiecare jucător primește exact același profil (implicit 3 ușoare, 2 medii, 1 grea).
- **Categorie** — fiecare jucător primește întrebări din categorii diferite, iar
  repartizarea se rotește între jucători, ca să nu se consume mereu aceleași categorii.
- **Tematic** — fiecare jucător primește garantat 2 întrebări biblice sau de nuntă.

Nicio întrebare nu se repetă în cadrul unei sesiuni. Fiecare tură urcă în
dificultate: ușoare, apoi medii, apoi cea grea la final.

Cu toate cele 11 categorii, 8 jucători folosesc 48 din cele 264 de întrebări —
poți relua jocul de câteva ori fără nicio repetare.

---

## Comenzi

| Comandă | Ce face |
|---|---|
| `npm run dev` | Pornește în modul dezvoltare |
| `npm run event` | Compilează și pornește — varianta pentru seara nunții |
| `npm run check:questions` | Verifică seturile de întrebări |
| `npm test` | Rulează testele |

---

## Cum e construit

Next.js (App Router) + TypeScript + Tailwind. Fără bază de date.

Toată starea jocului trăiește pe server, într-un singur loc, și se salvează în
`data/session.json` după fiecare mișcare. Cele trei ecrane sunt doar ferestre
către aceeași stare, ținute la zi printr-un flux SSE — nu pot ajunge să arate
lucruri diferite.

Cronometrul și punctajul se calculează tot pe server. Ecranul jucătorului
primește doar literele amestecate și trimite înapoi ce litere a așezat, niciodată
cuvântul — așa că răspunsul nu ajunge pe tabletă înainte să fie dezvăluit.

Singura excepție e consola gazdei, care cere explicit răspunsul (`?host=1`) ca
să poți judeca ce a spus invitatul. Nu e o măsură de securitate serioasă —
oricine e pe aceeași rețea și știe adresa o poate deschide — ci doar o barieră
împotriva unei priviri curioase peste umăr.
