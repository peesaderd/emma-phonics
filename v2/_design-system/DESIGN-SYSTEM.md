# Kidobits Design System

> ไฟล์นี้คือ**กฎ** ไม่ใช่คำแนะนำ
> Agent ที่จะแก้หน้า lobby (`index*.html`) ต้องอ่านก่อนเขียนโค้ด

---

## 1. กฎเหล็ก 5 ข้อ

| # | กฎ | ถ้าฝ่าฝืนจะเกิดอะไร |
|---|---|---|
| 1 | **ห้ามสร้างไฟล์ `index` ใหม่จากศูนย์** — ต้อง copy `index.html` แล้วแก้เฉพาะส่วน | `verify.mjs` เตือน `PAGE_REINLINES_DS` |
| 2 | **ห้ามประกาศสีดิบ** (`#hex`, `rgb()`, `rgba()`) ใน `components.css` | `ERROR RAW_HEX` / `RAW_RGBA` |
| 3 | **ห้ามใช้ `var(--x)` ที่ไม่มีใน `tokens.css`** | `ERROR UNDECLARED_TOKEN` |
| 4 | **ห้ามแก้ `tokens.css` / `components.css` / `examples/` โดยไม่อัปเดต MANIFEST** | `ERROR MANIFEST_DRIFT` |
| 5 | **ห้ามใช้ class นอก `ALLOWED_CLASSES`** (ดูข้อ 4) | `ERROR EXAMPLE_UNKNOWN_CLASS` |

`index.html`, `level.html`, `lesson.html`, `az.html` **ไม่ถูกบังคับแบบ fail-closed** — แค่เตือน (`PAGE_CHANGED`) เพราะเป็นหน้า production ที่ยังพัฒนา

---

## 2. Token ที่มีจริง (สกัดจาก `index.html`)

### ต้นฉบับ 8 ตัว — **ห้ามเปลี่ยนค่า**
```
--bg        #FFF9F0   พื้นหลังหลัก
--ink       #2E2A3B   ตัวอักษร
--muted     #8B85A0   ตัวอักษรรอง
--line      #F0E8FF   เส้นคั่น
--purple    #7C5CFF   แบรนด์หลัก
--purple-d  #5B4B8A   แบรนด์เข้ม
--shadow    0 6px 18px rgba(90,60,150,.12)
--r         24px      รัศมีมุม
```

### ที่เพิ่มจาก hardcode เดิม 23 จุด
```
--surface --surface-alt
--purple-l --pink-l
--amber --amber-bg1 --amber-bg2 --amber-ink --amber-muted --amber-logo
--pink-buddy --on-hero --on-hero-sub --ink-soft --ok-bg --ok-ink --overlay
--white-a13 --white-a10 --on-card-sub --pill-a92 --chev-a75 --deco-a14 --deco-a10
--sh-hero --sh-logo --sh-buddy --sh-warm --sh-wic --sh-card --sh-card-active
--sh-anim --sh-pill --ts-card
```

**ห้ามคิดชื่อ token ใหม่เอง** — ถ้าต้องการสีใหม่ ให้เพิ่มใน `tokens.css` ก่อน แล้วรัน `--update`

---

## 3. Component ที่มีจริง

| Component | class | ที่ใช้ |
|---|---|---|
| Hero | `.hero` `.logo` `h1` `.pills` `.pill` | หัวหน้า lobby |
| Mascot | `.buddy` `.buddy svg` | มุมขวาบน |
| Warmup strip | `.warm` `.wic` `.wt` `.ws` | แถบ A–Z |
| Level grid | `.lvgrid` | ตัวจัด grid |
| Level card | `.lvcard` `.anim` `.lvmeta` `h2` `.sub` `.prog` `.chev` | การ์ดบท |
| Modal | `.modal` `.sheet` `.sid` `.srow` | bottom sheet |
| Button | `.btn` `.btn.ghost` `.btn.play` | ปุ่ม |
| Base | `body` `.wrap` `footer` | โครง |

**อย่าคิด component ใหม่ก่อนถาม** — ถ้าจำเป็น ให้เพิ่มใน `components.css` + `examples/` + `MANIFEST`

---

## 4. `ALLOWED_CLASSES` (รายการปิด)

```
wrap hero logo pills pill buddy
warm wic wt ws chev
lvgrid lvcard anim lvmeta sub prog done
modal on sheet sid srow
btn ghost play
```

ขึ้นต้นด้วย `demo-` ได้เฉพาะใน `examples/`

---

## 5. ลำดับการทำงานที่ถูกต้อง

```
1. อ่าน DESIGN-SYSTEM.md  (ไฟล์นี้)
2. เปิด examples/lobby-layout.html  ← ดูของจริง
3. copy index.html → indexN.html
4. แก้เฉพาะส่วนที่ต้องแก้
5. node verify.mjs
6. ถ้า ERROR → แก้ให้ผ่าน ห้ามข้าม
7. ถ้าเปลี่ยน design system จริง → node verify.mjs --update
```

---

## 6. แก้ ERROR แต่ละตัวอย่างไร

### `RAW_HEX` / `RAW_RGBA`
```
ผิด:  .lvcard{box-shadow:0 6px 18px rgba(90,60,150,.16)}
ถูก:  .lvcard{box-shadow:var(--sh-card)}
```
เพิ่ม token ใน `tokens.css` ก่อนถ้ายังไม่มี

### `UNDECLARED_TOKEN`
`var(--foo)` ที่ `:root` ไม่มี → เพิ่มใน `tokens.css` หรือแก้ชื่อให้ตรง

### `EXAMPLE_UNKNOWN_CLASS`
ไปดู `ALLOWED_CLASSES` ในข้อ 4 → เปลี่ยนชื่อ class ให้ตรง หรือเพิ่ม component ใหม่ทั้งชุด

### `MANIFEST_DRIFT`
```
ถ้าตั้งใจแก้:   node verify.mjs --update
ถ้าไม่ตั้งใจ:   git checkout _design-system/
```

### `PAGE_REINLINES_DS` (WARN)
หน้าใหม่ inline CSS ที่ซ้ำกับ design system → เปลี่ยนเป็น `<link rel="stylesheet" href="_design-system/components.css">`

---

## 7. ทำไมไม่ใช้ TypeScript / ESLint

โปรเจกต์นี้ไม่มี build step — ทุกอย่างเป็น HTML ไฟล์เดียวเปิดตรง

```
lesson.html = 7.4 MB inline data
→ เข้า Vite ไม่ได้ (bundler parse ไม่ไหว)
→ ไม่มี module graph ให้ ESLint ห้าม import
```

`verify.mjs` คือสิ่งที่บังคับได้จริงในสแต็กนี้ — มันรันเร็ว ไม่ต้อง build ไม่แตะ `lesson.html`

**ถ้าวันหนึ่งต้อง migrate ไป React/TS** ให้ยก `tokens.css` + `components.css` ไปเป็น CSS vars + component ทีละตัว — design system นี้พร้อมถูกยก
