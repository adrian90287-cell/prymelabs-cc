import { ContactBlock, LegalList, LegalSection, LegalShell, P } from './legal/LegalDocument'

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Pryme Labs privacy"
      title="Privacy Policy"
      subtitle="This Privacy Policy explains what information we collect, how we use it, how we protect it, and the choices you have when you use prymelabs.net."
    >
      <LegalSection title="1. Scope of this Privacy Policy" tone="important">
        <P>
          This Privacy Policy applies to Pryme Labs, Pryme Research Group LLC, prymelabs.net, customer accounts, storefront checkout, order tracking, customer support, SMS/email communications, promotions, and related online services we operate. It does not apply to third-party websites, payment processors, carriers, or services we do not control.
        </P>
        <P>
          By using our site, creating an account, placing an order, signing up for notifications, contacting us, or otherwise submitting information, you acknowledge this Privacy Policy.
        </P>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <LegalList items={[
          'Account information: name, username, email address, phone number, password authentication data, language preference, login/session information, verification status, and account-security settings.',
          'Order information: products ordered, product departments, order numbers, order status, cart details, payment method selected, shipping address, billing-related details, discounts, taxes, shipping selections, tracking information, delivery status, customer notes, and support history.',
          'Payment information: payment method type, payment status, Stripe checkout identifiers where applicable, manual payment confirmation information, transaction-related metadata, and fraud-prevention signals. We do not store full card numbers.',
          'Communications: emails, SMS messages, support requests, product suggestions, reviews, unsubscribe/resubscribe preferences, security notices, account recovery activity, and customer-service records.',
          'Device and technical information: IP address, browser type, device type, operating system, referring pages, pages visited, timestamps, API request information, security logs, cookie/session identifiers, and approximate location derived from network or shipping/address tools.',
          'Address and delivery information: address-autocomplete selections, coordinates where needed for local-delivery eligibility, carrier rate information, delivery instructions, phone number for carrier or local-delivery contact, and tracking events.',
          'Compliance and security information: age/access acknowledgments, peptide-department verification status, login attempts, password reset activity, 2FA-related status where applicable, audit logs, fraud-risk indicators, duplicate-account indicators, and records required to protect the site.',
        ]} />
      </LegalSection>

      <LegalSection title="3. Sources of information">
        <LegalList items={[
          'Directly from you when you create an account, place an order, enter checkout details, contact support, submit a review, subscribe to communications, or use site forms.',
          'Automatically from your browser, device, network, cookies, session storage, security systems, and server logs.',
          'From service providers such as payment processors, shipping carriers, address-autocomplete tools, email/SMS providers, fraud-prevention systems, hosting providers, and operational software.',
          'From internal admin activity, such as order updates, payment verification, security reviews, refund processing, shipment handling, and compliance checks.',
        ]} />
      </LegalSection>

      <LegalSection title="4. How we use information">
        <LegalList items={[
          'Create, maintain, secure, and authenticate customer accounts.',
          'Process orders, calculate totals, collect payment, verify manual payments, prevent duplicate or fraudulent transactions, and issue refunds or credits.',
          'Ship products, calculate shipping rates, validate delivery information, provide tracking, coordinate local delivery where enabled, and resolve carrier issues.',
          'Operate separate checkout and verification flows for different product departments, including additional access controls for peptide/research-use products.',
          'Send transactional messages such as order confirmations, payment reminders, shipping updates, password resets, username recovery, account notices, verification codes, security alerts, and support replies.',
          'Send promotional messages, new-release notices, waitlist updates, and marketing communications where permitted and subject to your opt-out choices.',
          'Maintain site security, rate limits, audit logs, admin controls, fraud prevention, access restrictions, and abuse monitoring.',
          'Improve product catalog organization, storefront design, customer experience, inventory planning, launch planning, and support operations.',
          'Comply with legal, tax, accounting, payment, security, regulatory, dispute-resolution, and recordkeeping obligations.',
        ]} />
      </LegalSection>

      <LegalSection title="5. How we disclose information">
        <P>
          We do not sell your personal information for money. We also do not rent customer lists. We may disclose information only as reasonably necessary for the purposes described in this Policy.
        </P>
        <LegalList items={[
          'Payment processors, including Stripe or other processors we use for eligible departments, to process checkout, prevent fraud, handle disputes, and maintain payment records.',
          'Shipping carriers, local-delivery providers, address-validation/autocomplete providers, and logistics vendors to calculate rates, ship orders, provide tracking, and complete delivery.',
          'Email, SMS, notification, and communications providers to send account, order, support, security, marketing, and verification messages.',
          'Hosting, database, security, analytics, monitoring, and technical service providers that help operate and protect the site.',
          'Professional advisors, insurers, accountants, legal counsel, auditors, and compliance consultants where reasonably necessary.',
          'Government authorities, law enforcement, regulators, courts, payment networks, or other parties where required by law, subpoena, legal process, fraud investigation, safety concern, or rights protection.',
          'Business-transfer parties if we are involved in a merger, acquisition, financing, reorganization, asset sale, bankruptcy, or similar transaction, subject to appropriate protections where required.',
        ]} />
      </LegalSection>

      <LegalSection title="6. Cookies, local storage, and similar technologies">
        <P>
          We use necessary cookies, local storage, and similar technologies to keep the storefront working. These technologies may support login sessions, cart storage, language preference, security controls, checkout flow, stale-page refresh, and basic site functionality.
        </P>
        <P>
          Your browser may allow you to block or delete cookies and local storage. Some site features, including login, cart, checkout, order history, and account recovery, may not work correctly if these technologies are disabled.
        </P>
      </LegalSection>

      <LegalSection title="7. Email, SMS, phone, and notification choices">
        <LegalList items={[
          'Transactional communications are necessary for orders, payment verification, account recovery, security alerts, shipping, delivery, and support.',
          'Promotional emails or texts may be sent only where permitted and may be stopped using unsubscribe options, account preferences, or by contacting support.',
          'SMS delivery depends on phone-carrier systems and third-party providers. Message and data rates may apply.',
          'You are responsible for providing a phone number and email address that you are authorized to use. Do not provide someone else’s contact information without permission.',
        ]} />
      </LegalSection>

      <LegalSection title="8. Data security">
        <P>
          We use administrative, technical, and organizational safeguards designed to protect customer information, including encrypted secrets, password hashing, access controls, rate limiting, audit logging, account verification, and restricted admin functions. We also limit access to information to personnel and service providers who need it for legitimate business purposes.
        </P>
        <P>
          No website, database, email system, SMS system, or internet transmission can be guaranteed 100% secure. You are responsible for keeping your password confidential, using a strong password, enabling available security features, and notifying us promptly if you suspect unauthorized access.
        </P>
      </LegalSection>

      <LegalSection title="9. Data retention">
        <P>
          We retain information for as long as reasonably necessary to operate the site, provide services, complete transactions, maintain records, resolve disputes, prevent fraud, enforce agreements, comply with legal/tax/accounting obligations, and protect Pryme Labs and customers. Retention periods vary by data type, legal requirement, operational need, and security risk.
        </P>
      </LegalSection>

      <LegalSection title="10. Your privacy choices and rights">
        <P>
          Depending on where you live, you may have rights to request access, correction, deletion, portability, restriction, or objection regarding certain personal information. You may also have the right to opt out of certain targeted advertising, sale, sharing, profiling, or marketing communications where applicable law provides those rights.
        </P>
        <LegalList items={[
          'Access or correction: contact us to request a copy or correction of account or order information.',
          'Deletion: you may request deletion of certain information, but we may retain records needed for orders, security, legal compliance, tax, dispute, fraud-prevention, or legitimate business purposes.',
          'Marketing opt-out: use unsubscribe links or contact us to stop promotional messages. Transactional messages may still be sent.',
          'Appeals: if we deny a privacy request and applicable law gives you appeal rights, you may appeal by replying to our decision email or contacting support.',
        ]} />
      </LegalSection>

      <LegalSection title="11. State privacy notices">
        <P>
          Residents of certain U.S. states, including California and other states with consumer privacy laws, may have additional rights. We do not knowingly sell personal information for money. If any future activity is considered a “sale,” “sharing,” or “targeted advertising” under applicable law, we will provide the required notice and opt-out mechanism.
        </P>
        <P>
          We do not knowingly use sensitive personal information to infer characteristics except as needed for allowed purposes such as security, fraud prevention, order fulfillment, payment processing, compliance, and account verification.
        </P>
      </LegalSection>

      <LegalSection title="12. Children’s privacy">
        <P>
          Pryme Labs is not directed to children. You must be at least 21 years old to purchase from Pryme Labs. We do not knowingly collect personal information from children. If you believe a minor provided information to us, contact us so we can review and take appropriate action.
        </P>
      </LegalSection>

      <LegalSection title="13. International users">
        <P>
          Pryme Labs is operated from the United States. If you access the site from outside the United States, you understand that information may be processed and stored in the United States or other locations where our service providers operate. You are responsible for complying with laws that apply to your location.
        </P>
      </LegalSection>

      <LegalSection title="14. Changes to this Privacy Policy">
        <P>
          We may update this Privacy Policy to reflect operational, legal, security, or business changes. The “Last updated” date shows when the current version was posted. Continued use of the site after updates means you acknowledge the revised Policy.
        </P>
      </LegalSection>

      <LegalSection title="15. Contact us">
        <P>
          For privacy requests or questions, contact Pryme Labs below. To help us verify and process your request, include your name, email address, order number if relevant, and the request you are making.
        </P>
        <ContactBlock />
      </LegalSection>
    </LegalShell>
  )
}
