# KLSH Drug Search Firebase Ready

เว็บค้นหายาโรงพยาบาลกาฬสินธุ์ โทนมินิมอลเขียวมะกอก ใช้ฟอนต์ Mitr และเชื่อม Firebase Realtime Database ให้แล้ว

## พร้อมใช้กับ Firebase project

ไฟล์ `firebase-config.js` ใส่ config ของ project `klshdrug` แล้ว

Database path ที่ใช้:

```txt
klsh_drug_search/drugs
```

## วิธีเอาขึ้น GitHub Pages

1. แตก zip
2. อัปไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น GitHub repo ที่ root
3. GitHub repo > Settings > Pages
4. Source: Deploy from branch
5. Branch: main / root
6. เปิดลิงก์ GitHub Pages

## วิธีตั้ง Firebase Rules

ไปที่ Firebase Console > Realtime Database > Rules แล้ววาง:

```json
{
  "rules": {
    "klsh_drug_search": {
      "drugs": {
        ".read": true,
        ".write": true,
        "$drugId": {
          ".validate": "newData.hasChildren(['genericName']) || !newData.exists()"
        }
      }
    }
  }
}
```

แล้วกด Publish

## วิธีใช้งาน

- คนทั่วไป: ค้นหายาได้อย่างเดียว
- Admin: กดปุ่ม Admin แล้วใส่รหัส `10709`
- หลังเข้า Admin จะเพิ่มยา แก้ยา ลบยา และสำรองข้อมูล JSON ได้
- ปุ่ม “ใส่ยาทดสอบ” จะใช้สำหรับนำรายการตัวอย่างจาก `drugs.json` ขึ้น Firebase ครั้งแรก

## หมายเหตุความปลอดภัย

รหัส `10709` เป็นรหัสกันหน้าเว็บแบบง่าย เหมาะสำหรับทดสอบหรือใช้ภายในขนาดเล็ก ถ้าจะใช้จริงจังมากขึ้นควรเพิ่ม Firebase Authentication และปรับ Rules ให้เขียนได้เฉพาะผู้ที่ล็อกอิน
