import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { LEGAL_DISCLAIMER } from '@/lib/constants';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="bg-navy py-14 text-white">
      <div className="container max-w-4xl">
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-slate-300">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ---------------- How it works ---------------- */
export function HowItWorks() {
  useDocumentTitle('How it works');
  const owner = [
    ['Create your free listing', 'Add your car details, up to 20 photos, your asking price and your ZIP code. Your exact address is never shown.'],
    ['Set the referral fee', 'Choose a fixed amount (e.g. $300) or a percentage of the sale price. You only pay it if a promoter brings the buyer.'],
    ['Approve promoters', 'Promoters ask to share your car. Review their profile and rating, or let any verified promoter share it automatically.'],
    ['Talk to buyers safely', 'Chat inside AutoPromo. Contact details are only shared after a visit is scheduled.'],
    ['Sell and transfer the title yourself', 'You meet the buyer, agree on the final price and sign the title over — just like any private sale.'],
    ['Confirm the sale', 'Mark the car as sold. If a promoter referred the buyer, you pay their fee securely through AutoPromo.'],
  ];
  const promoter = [
    ['Create a promoter account', 'Verify your identity and connect a bank account to receive payouts.'],
    ['Choose cars to promote', 'Browse cars in your area and see exactly how much each owner pays per referral.'],
    ['Share your unique link', 'Every car gets a personal link plus a ready-made post and image for social media.'],
    ['Help buyers', 'Answer questions and help interested buyers schedule a visit with the owner.'],
    ['Get paid', 'When the owner confirms the sale to your buyer, your commission is sent to your bank account.'],
  ];
  return (
    <>
      <PageHeader title="How AutoPromo works" subtitle="A simple way to sell your car faster — or earn money helping others sell theirs." />
      <div className="container max-w-4xl space-y-14 py-14">
        <Steps id="owners" title="For car owners" items={owner} />
        <Steps id="promoters" title="For promoters" items={promoter} />
        <div className="flex gap-3 rounded-xl border bg-secondary/50 p-5 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p>{LEGAL_DISCLAIMER}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg"><Link to="/signup">Get started free</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/cars">Browse cars</Link></Button>
        </div>
      </div>
    </>
  );
}

function Steps({ id, title, items }: { id: string; title: string; items: string[][] }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-bold">{title}</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map(([t, d], i) => (
          <li key={t} className="flex gap-4 rounded-xl border bg-card p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{i + 1}</span>
            <div>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
const FAQS: [string, string][] = [
  ['Does AutoPromo sell cars?', 'No. AutoPromo is a listing and referral platform. Every sale and title transfer happens directly between the owner and the buyer.'],
  ['How much does it cost to list my car?', 'Listing is free. You only pay the referral fee you set if a promoter brings the buyer who purchases your car.'],
  ['What is a promoter?', 'A promoter is an independent person who shares your car with their network (social media, groups, friends) and helps interested buyers connect with you. They earn the referral fee you offered when the sale closes.'],
  ['Do promoters negotiate or sign anything for me?', 'No. Promoters only refer buyers. You decide the final price, meet the buyer and sign the title yourself.'],
  ['How do I know a promoter brought the buyer?', 'Each promoter has a unique link. When a buyer arrives through that link or chats with the promoter, AutoPromo records the referral automatically.'],
  ['Where is AutoPromo available?', 'We are starting in Texas and will open more states soon.'],
  ['Is my address shown on the listing?', 'No. Only your city, state and ZIP code are shown. Your phone number is only shared after a visit is scheduled.'],
  ['How do promoters get paid?', 'Owners pay the referral fee through AutoPromo after the sale is confirmed, and the promoter receives it in their bank account via Stripe.'],
];

export function Faq() {
  useDocumentTitle('Frequently asked questions');
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <PageHeader title="Frequently asked questions" />
      <div className="container max-w-3xl py-14">
        <div className="divide-y rounded-xl border bg-card">
          {FAQS.map(([q, a], i) => (
            <div key={q}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left font-semibold"
                aria-expanded={open === i}
              >
                {q}
                <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open === i && 'rotate-180')} />
              </button>
              {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>}
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Still have questions? <a href="mailto:support@autopromo.example" className="font-semibold text-primary hover:underline">Contact support</a>
        </p>
      </div>
    </>
  );
}

/* ---------------- Legal ---------------- */
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} subtitle={`Last updated: ${new Date(2026, 10, 11).toLocaleDateString('en-US')}`} />
      <div className="container max-w-3xl py-12">
        <div className="mb-8 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>Placeholder text.</strong> This document is a template and must be reviewed and completed by a
            licensed U.S. attorney before launch.
          </p>
        </div>
        <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground">
          {children}
        </div>
      </div>
    </>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>These Terms govern your use of AutoPromo (the "Platform"). By creating an account you agree to them.</p>
      <h2>1. What AutoPromo is</h2>
      <p>{LEGAL_DISCLAIMER} AutoPromo is not a party to any vehicle sale and does not take title to, inspect, or guarantee any vehicle.</p>
      <h2>2. Accounts</h2>
      <p>You must be at least 18 years old and provide accurate information. You are responsible for activity on your account.</p>
      <h2>3. Owners</h2>
      <p>Owners must be the legal owner of the listed vehicle (or authorized to sell it), describe it accurately, and comply with all applicable state and federal laws, including disclosure requirements.</p>
      <h2>4. Promoters</h2>
      <p>Promoters act as independent referral partners, not as agents, brokers or dealers. Promoters may not negotiate prices, accept payments, sign documents or take possession of vehicles on behalf of owners. Additional terms are set out in the Promoter Agreement.</p>
      <h2>5. Referral fees</h2>
      <p>Owners agree to pay the referral fee shown on their listing when a sale is completed with a buyer referred by a promoter. Fees are processed through our payment provider. AutoPromo retains a platform fee.</p>
      <h2>6. Prohibited conduct</h2>
      <p>No fraud, misleading listings, circumventing the Platform to avoid fees, harassment, or illegal activity.</p>
      <h2>7. Disclaimers and limitation of liability</h2>
      <p>The Platform is provided "as is". To the maximum extent permitted by law, AutoPromo is not liable for vehicles, transactions or user conduct.</p>
      <h2>8. Contact</h2>
      <p>Questions: support@autopromo.example</p>
    </LegalPage>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This Policy explains what information AutoPromo collects and how we use it.</p>
      <h2>Information we collect</h2>
      <p>Account details (name, email), listing information and photos, messages sent through the Platform, approximate location (ZIP code), referral and usage data, and payment information processed by our payment provider (Stripe).</p>
      <h2>How we use it</h2>
      <p>To operate the marketplace, attribute referrals, process payments, prevent fraud, and communicate with you.</p>
      <h2>What is public</h2>
      <p>Your first and last name as entered, your profile photo, and your listings (city, state and ZIP — never your street address). Your email and phone number are not public.</p>
      <h2>Sharing</h2>
      <p>We share data with service providers (hosting, email, payments) and when required by law. We do not sell your personal information.</p>
      <h2>Your rights</h2>
      <p>You may access, correct or delete your data by contacting support@autopromo.example. Residents of certain states may have additional rights.</p>
      <h2>Cookies</h2>
      <p>We use essential cookies for sign-in and a referral cookie (valid for 30 days) to credit promoters.</p>
    </LegalPage>
  );
}

/* ---------------- 404 ---------------- */
export function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="container py-20">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or was moved."
        action={<Button asChild><Link to="/">Go home</Link></Button>}
      />
    </div>
  );
}
