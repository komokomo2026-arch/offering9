CHURCH OFFERING SYSTEM v6 - ONE APP WITH THREE SYSTEMS (Offering + Finance + Members)
=====================================================================================

UPLOAD TO GITHUB PAGES
  1. Unzip this file. (GitHub cannot open a .zip - upload the unzipped files.)
  2. Open your repository -> Add file -> Upload files.
  3. Drag in EVERYTHING from the unzipped folder, INCLUDING the "lib" folder
     (keep it as a folder: lib/fa/css and lib/fa/webfonts must stay inside it).
  4. Commit changes. Wait 1-3 minutes. Open the site once while online so the app
     saves itself for offline use. Open Backup page -> Connect to Google as before.

FILES (all go in the SAME place, the main page of the repository)
  index.html           Offering System (main) + buttons that open the other two
  finance.html         Church Finance System
  members.html         Members Data System
  backup-kit.js        shared Backup/Restore page used by Finance and Members
  lib/                 offline copies of the libraries Members needs (alerts, PDF, icons)
  manifest.json, service-worker.js, icons (*.png)   install + offline
  Terms.html, Policy.html                           legal pages

HOW IT FITS TOGETHER
  - Offering System buttons "Finance System" and "Members System" (directly below
    Video Guide; in the footer on large screens, in More on phones) open each system
    inside the app. The "Offering System" button at the top returns to the main page
    without closing the other system.
  - Each system has its OWN database in the browser (ChurchOfferingsDB,
    ChurchFinanceKSH, ChurchCMSDB), its own settings, its own Drive folder, its own
    backup file and its own Auto Backup switch. Nothing is mixed.
  - Google is connected ONLY in the Offering System (Backup page). Finance and
    Members use that same connection; they have no Connect button.
  - Finance: Privacy Policy removed; B/F is on the desktop menu; Backup is at the
    bottom of the B/F page.  Members: "BACK UP" is under REPORT in the menu;
    Import CSV is in the Full Name "+" form.

IMPORTANT LIMITS (honest)
  - Automatic backup runs only while the app is open. A browser cannot back up after
    the page is closed. Changes made offline are backed up when you are online and
    Google is connected again.
  - Google sign-in lasts about an hour (no long-term login without a server). When it
    ends, the Finance/Members pages say so and you reconnect in the Offering System.
  - Browser storage and speed limits apply; very large data may need a modern device.
  - If you clear the browser's site data, local records are lost: keep Drive backups.
  - Dark theme and the new screens were checked by automated tests, not by eye on a
    phone: please look at each page on your phone and computer after uploading.
