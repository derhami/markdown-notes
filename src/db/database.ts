/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Dexie, { type Table } from 'dexie';
import type { Note, Folder, Tag, Settings } from '../types';

export class MarkdownNotesDatabase extends Dexie {
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  tags!: Table<Tag, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('MarkdownNotesDatabase');
    this.version(1).stores({
      notes: 'id, title, folderId, *tags, isFavorite, isPinned, createdAt, updatedAt, deletedAt',
      folders: 'id, name, parentId, createdAt, updatedAt',
      tags: 'id, name, color, createdAt',
      settings: 'id'
    });
  }
}

export const db = new MarkdownNotesDatabase();

// Default values
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'en', // English-only UI is standard
  editorFontSize: 15,
  editorLineHeight: '1.6',
  editorWordWrap: true,
  autoSaveInterval: 500,
  sidebarOpen: true,
  noteListWidth: 320,
  editorMode: 'split',
  accentColor: '#3e6493', // sophisticated muted cobalt accent
  uiDensity: 'comfortable',
  editorWidth: 'comfortable'
};

/**
 * Initialize Demo Data in the database if empty
 */
export async function initializeDemoData() {
  const notesCount = await db.notes.count();
  if (notesCount > 0) return; // DB already has data

  const now = Date.now();

  // Create standard tags
  const demoTags = [
    { id: 't1', name: 'work', color: '#3b82f6', createdAt: now },
    { id: 't2', name: 'personal', color: '#ec4899', createdAt: now },
    { id: 't3', name: 'ideas', color: '#10b981', createdAt: now },
    { id: 't4', name: 'guide', color: '#8b5cf6', createdAt: now }
  ];
  await db.tags.bulkAdd(demoTags);

  // Create folder structure
  const demoFolders = [
    { id: 'f1', name: 'پروژه‌ها (Projects)', parentId: null, createdAt: now, updatedAt: now },
    { id: 'f2', name: 'روزمره‌نویسی (Journal)', parentId: null, createdAt: now, updatedAt: now },
    { id: 'f1_sub', name: 'طراحی بصری (Visual Design)', parentId: 'f1', createdAt: now, updatedAt: now }
  ];
  await db.folders.bulkAdd(demoFolders);

  // Default settings
  await db.settings.put({ id: 'current', ...DEFAULT_SETTINGS });

  // Create demo notes
  const demoNotes: Note[] = [
    {
      id: 'demo-welcome',
      title: 'خوش‌آمدید به مارک‌داون نوتز 📝',
      content: `# به Markdown Notes خوش آمدید! 👋

این یک محیط کاملاً حرفه‌ای، **بومی و آفلاین (Offline-first / Local-first)** برای یادداشت‌نویسی، ثبت دانش و برنامه‌ریزی روزانه است. داده‌های شما با نهایت امنیت در مرورگر خودتان ذخیره می‌شود و مالکیت ۱۰۰٪ آن متعلق به شماست.

---

### 🎨 ویژگی‌های کلیدی این جعبه‌ابزار مستقل:
- **نوشتن با فرمت استاندارد مارک‌داون (Markdown-Native)**
- **مدیریت پوشه‌ها به‌صورت درختی و تو در تو** 📂
- **برچسب‌گذاری چندگانه با تم‌های رنگی جذاب** 🏷️
- **منوی ابزار سریع (Command Palette) با فشردن کلید میانبر \`Ctrl + K\`** ⌨️
- **حالت ذن (Zen writing) و تمرکز بدون حواس‌پرتی** 🧘
- **امکان وارد کردن (Import) و خارج کردن (Export) فایل‌های مارک‌داون به سادگی هرچه تمام‌تر**

---

### 💡 لیست کارهای آغازین شما (Task List):
- [x] این یادداشت نمونه را بررسی کنید.
- [ ] در منوی تنظیمات پایین سمت چپ، زبان یا تم رنگی را تغییر دهید.
- [ ] یک پوشه جدید به نام "کارهای من" بسازید.
- [ ] اولین فایل مارک‌داون خودتان را ایجاد یا ایمپورت کنید.

---

### 💻 نمونه‌ای از بلوک کد با رنگ‌آمیزی ساختار:
\`\`\`javascript
// این یک کد نمونه برای بررسی ویرایشگر است
function greetUser(name) {
  console.log(\`به دنیای خلوت نویسندگی خود خوش آمدید، \${name}!\`);
}
greetUser('نویسنده خلاق');
\`\`\`

---

> "سادگی نهایت پیچیدگی است." 
> — لئوناردو داوینچی
`,
      folderId: null,
      tags: ['guide'],
      isFavorite: true,
      isPinned: true,
      createdAt: now - 3600000 * 2, // 2 hours ago
      updatedAt: now,
      wordCount: 198,
      characterCount: 1200,
      readingTime: 1,
      deletedAt: null
    },
    {
      id: 'demo-cheatsheet',
      title: 'راهنمای جامع نوشتن Markdown 💡',
      content: `# راهنمای جامع نشانه‌گذاری مارک‌داون (Cheatsheet)

از این یادداشت به عنوان یک مرجع سریع برای نوشتن متون در ویرایشگر استفاده کنید.

## ۱. عناوین (Headings)
شما با قرار دادن علامت \`#\` می‌توانید عناوین مختلف ایجاد کنید:
# عنوان سطح ۱ (H1)
## عنوان سطح ۲ (H2)
### عنوان سطح ۳ (H3)

---

## ۲. ضخامت، مورب و خط‌خوردگی
- جهت نوشتن متن **ضخیم (Bold)** متن را بین دو ستاره قرار دهید: \`**متن ضخیم**\`
- جهت نوشتن متن *مورب (Italic)* متن را بین یک ستاره قرار دهید: \`*متن مورب*\`
- جهت ایجاد متن ~~خط‌خورده (Strikethrough)~~ از دو علامت مد استفاده کنید: \`~~متن خط‌خورده~~\`

---

## ۳. لیست‌ها (Lists)
### لیست‌های ترتیبی:
1. کار اول
2. کار دوم
3. کار سوم

### لیست‌های نشانه‌دار:
- ایده خلاقانه اول
- ایده خلاقانه دوم
- ایده خلاقانه سوم

---

## ۴. جدول‌ها (Tables)

| نام پروژه | زبان توسعه | وضعیت | اولویت |
| :--- | :---: | :---: | :---: |
| مارک‌داون نوتز | React + TS | در حال توسعه | بحرانی |
| اپلیکیشن اندروید | Capacitor | برنامه‌ریزی شده | بالا |
| موتور همگام‌سازی | Local-first | فاز تحقیق | متوسط |

---

## ۵. نقل قول (Blockquote)
> "نوشتن، نوعی اندیشیدن روی کاغذ است. هر چه ساده‌تر، روشن‌تر و عمیق‌تر."
`,
      folderId: 'f1_sub',
      tags: ['guide', 'ideas'],
      isFavorite: false,
      isPinned: false,
      createdAt: now - 3600000 * 24, // 1 day ago
      updatedAt: now - 3600000 * 2,
      wordCount: 220,
      characterCount: 1400,
      readingTime: 2,
      deletedAt: null
    },
    {
      id: 'demo-project-ideas',
      title: 'ایده‌های توسعه محصول آینده 🚀',
      content: `# ایده‌های توسعه محصول آینده

این یادداشت به صورت ویژه برای ثبت ایده‌های توسعه اپلیکیشن **Markdown Notes** طراحی شده است.

### 🌟 برنامه‌ریزی فازهای بعدی:
1. **PWA Shell**: پیاده‌سازی سرویس ورکر جهت کش کامل دارایی‌ها و اجرای آفلاین در لایه وب.
2. **Capacitor Integration**: پیکربندی لایه اندروید جهت تولید بسته \`.apk\` نصبی با حفظ کامل دیتابیس بومی.
3. **Local Share Intents**: امکان اشتراک‌گذاری مستقیم فایل مارک‌داون از برنامه‌های دیگر گوشی به مارک‌داون نوتز.
4. **Biometric Lock**: قفل اثر انگشت برای یادداشت‌های خصوصی (روی اندروید).

### 📝 یادداشت‌های پراکنده:
- رنگ تم تیره بسیار عمیق طراحی شود تا چشم در تاریکی خسته نشود (بر پایه رنگ سیاه عمیق \`#0D0E11\`).
- در بخش تنظیمات، میزان ذخیره فضا به مگابایت به صورت دقیق به کاربر گزارش شود.
`,
      folderId: 'f1',
      tags: ['work', 'ideas'],
      isFavorite: false,
      isPinned: false,
      createdAt: now - 3600000 * 48, // 2 days ago
      updatedAt: now - 3600000 * 20,
      wordCount: 110,
      characterCount: 750,
      readingTime: 1,
      deletedAt: null
    }
  ];

  await db.notes.bulkAdd(demoNotes);
}
