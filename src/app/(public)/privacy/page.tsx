import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage, Section } from "../legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="MarksKoi? shows students the marks their instructors keep in Google Sheets. This page explains what information it uses, who can see it, and how it is protected."
    >
      <Section title="Who runs MarksKoi?">
        <p>
          MarksKoi? is developed and maintained by Mohammad Rakibul Hasan Mahin. Questions about this policy or your data can be sent to <Contact />.
        </p>
      </Section>

      <Section title="What we collect when you sign in">
        <p>You sign in with your university Google account. From Google we receive only:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your name, email address and profile photo, and</li>
          <li>an identifier for your Google account, so we recognise you next time.</li>
        </ul>
        <p>
          MarksKoi? never asks for access to your Google Drive, Gmail, Calendar or any other Google data, and does not store Google access tokens. Only
          university email addresses can sign in.
        </p>
      </Section>

      <Section title="What we get from instructors’ spreadsheets">
        <p>
          Instructors share their marks spreadsheet with MarksKoi? using view-only access. MarksKoi? reads it but never edits it. From the class list and
          the columns the instructor chooses, it copies:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>student ID, name and email address, used to match each row to the right student, and</li>
          <li>the marks, attendance and statuses the instructor chooses to show.</li>
        </ul>
        <p>Columns the instructor does not select are never shown to anyone. MarksKoi? does not calculate totals or grades.</p>
      </Section>

      <Section title="Who can see your marks">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="font-semibold">You</strong> see only your own marks, and only after your instructor publishes them. No student can see another
            student’s marks.
          </li>
          <li>
            <strong className="font-semibold">Your instructors</strong> (the faculty assigned to the course) see the marks for their own course, as they already
            do in their spreadsheet.
          </li>
          <li>
            <strong className="font-semibold">Administrators</strong> of MarksKoi? can access records to provide support, fix problems and keep the service secure.
          </li>
        </ul>
        <p>We do not sell, rent or share your information with anyone else, and we do not use it for advertising.</p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          MarksKoi? uses one essential cookie to keep you signed in. There are no advertising or analytics cookies and no third-party trackers.
        </p>
      </Section>

      <Section title="Where your data is stored and how it is protected">
        <p>
          The website is hosted on Netlify, and the database on Supabase (Amazon Web Services, Asia Pacific region). Connections are encrypted, access is
          limited by role, and important actions such as publishing marks are recorded in an audit log.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Marks are kept for as long as the course exists in MarksKoi?. When an instructor deletes a course, its marks are deleted with it. Your account
          details are kept while you use the service. You can ask for your account to be removed by emailing <Contact />.
        </p>
      </Section>

      <Section title="Corrections">
        <p>
          Your marks come from your instructor’s spreadsheet. If a mark looks wrong, contact your instructor; once they correct the sheet, MarksKoi? updates
          automatically.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If this policy changes, the new version will be posted here with a new date. See also the <Link className="text-primary underline underline-offset-4" href="/terms">terms of use</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
