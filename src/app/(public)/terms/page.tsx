import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage, Section } from "../legal";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro="By signing in to MarksKoi? you agree to these terms. They are short, and written to be read."
    >
      <Section title="Who can use MarksKoi?">
        <p>
          MarksKoi? is for students and faculty with a university Google account. Students use it to view their own marks; faculty use it to share marks from
          their own spreadsheets.
        </p>
      </Section>

      <Section title="Your marks">
        <p>
          Marks shown in MarksKoi? are copied from your instructor’s spreadsheet. Your instructor and the university remain the source of your official
          results. If something looks wrong, contact your instructor.
        </p>
      </Section>

      <Section title="Using it responsibly">
        <ul className="list-disc space-y-1 pl-5">
          <li>Use only your own account, and keep it to yourself.</li>
          <li>Do not try to view other people’s marks or get around access controls.</li>
          <li>Do not overload, disrupt or attempt to break the service.</li>
          <li>Faculty: share only spreadsheets for courses you teach, and only the columns students should see.</li>
        </ul>
        <p>Accounts that misuse the service may be suspended.</p>
      </Section>

      <Section title="Availability">
        <p>
          We work to keep MarksKoi? accurate and available, but it is provided as is, without guarantees. Marks may take a few minutes to appear after an
          instructor updates their sheet, and the service may occasionally be unavailable for maintenance.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          How we handle your information is described in the <Link className="text-primary underline underline-offset-4" href="/privacy">privacy policy</Link>.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          These terms may be updated; the new version will be posted here with a new date. Questions: <Contact />.
        </p>
      </Section>
    </LegalPage>
  );
}
