import { ContactBlock, LegalList, LegalSection, LegalShell, NumberedList, P } from './legal/LegalDocument'

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Pryme Labs legal"
      title="Terms of Service"
      subtitle="These Terms govern your access to and use of prymelabs.net, your account, orders, payments, product access, and communications with Pryme Labs."
    >
      <LegalSection title="1. Agreement to these Terms" tone="important">
        <P>
          These Terms of Service are a binding agreement between you and Pryme Labs, Pryme Research Group LLC, and our affiliated brands, departments, operators, and service providers, as applicable (“Pryme Labs,” “we,” “us,” or “our”). By visiting prymelabs.net, creating an account, placing an order, submitting information, or using any storefront or admin-adjacent customer feature, you agree to these Terms and to all policies referenced here.
        </P>
        <P>
          If you do not agree, do not access the site, create an account, purchase products, or submit information. We may update these Terms from time to time. Your continued use of the site after changes are posted means you accept the updated Terms.
        </P>
        <P>
          This page is provided for business policy and compliance transparency. It is not legal advice to any visitor or customer.
        </P>
      </LegalSection>

      <LegalSection title="2. Eligibility, age, and account responsibility">
        <LegalList items={[
          'You must be at least 21 years old to purchase from Pryme Labs. We may request verification and may refuse or cancel any order where eligibility cannot be confirmed.',
          'You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account.',
          'You agree to provide accurate, current, and complete information, including name, email, phone number, shipping address, and payment-related information.',
          'You may not create multiple accounts to bypass purchase restrictions, verification requirements, account limitations, promotions, security controls, or compliance review.',
          'We may suspend, restrict, or terminate accounts for suspected fraud, misuse, chargeback abuse, policy violations, unlawful activity, or any activity that creates legal, operational, or security risk.',
        ]} />
      </LegalSection>

      <LegalSection title="3. Product departments and category-specific terms" tone="warning">
        <P>
          Pryme Labs operates multiple product departments. Different product types carry different rules, warnings, and intended-use limitations. You are responsible for reviewing the product page, packaging, label, warnings, certificate information, and the Legal & Compliance page before purchasing or using any item.
        </P>
        <LegalList items={[
          'Peptides and research chemicals are sold strictly for laboratory research use only. They are not dietary supplements, foods, cosmetics, drugs, medicines, or consumer-use products. They are not for human or animal consumption, injection, ingestion, topical application, therapeutic use, diagnostic use, veterinary use, or clinical use.',
          'Dietary supplements and wellness products must be used only as labeled. Statements about supplements have not been evaluated by the Food and Drug Administration unless expressly stated otherwise. Supplements are not intended to diagnose, treat, cure, or prevent disease.',
          'Cosmetic, grooming, skin-care, hair-care, and personal-care products are for external use only unless the product label clearly states otherwise. Cosmetic products are not intended to diagnose, treat, cure, or prevent any disease or medical condition.',
          'Apparel, merchandise, drinkware, gym accessories, and similar items are sold as consumer merchandise and should be used only for their ordinary intended purpose.',
        ]} />
      </LegalSection>

      <LegalSection title="4. Peptide and research-use purchaser representations">
        <P>
          When you access or purchase from the Peptides department or any research-use section, you make the following representations and warranties:
        </P>
        <NumberedList items={[
          'You are a qualified researcher, professional, institution, laboratory, or authorized buyer purchasing for legitimate research purposes only.',
          'You will not use research-use products for human or animal consumption, administration, compounding for human or animal use, personal experimentation, medical treatment, diagnosis, disease prevention, veterinary treatment, cosmetic use, resale for consumption, or any unlawful purpose.',
          'You understand that research-use products may not have been evaluated by the FDA or any other agency for safety, effectiveness, purity for human use, dosing, interactions, contraindications, or suitability for any consumer purpose.',
          'You are solely responsible for knowing and complying with all laws, rules, regulations, restrictions, permits, licenses, institutional protocols, storage requirements, handling requirements, and disposal requirements that apply to your purchase and use.',
          'You agree not to make claims, market, resell, transfer, relabel, or distribute research-use products in a way that suggests human use, animal use, drug use, supplement use, cosmetic use, medical benefit, therapeutic benefit, or disease-related benefit.',
        ]} />
      </LegalSection>

      <LegalSection title="5. Orders, acceptance, pricing, and availability">
        <LegalList items={[
          'An order confirmation means we received your order request; it does not guarantee acceptance, fulfillment, shipment, or availability.',
          'We may accept, reject, cancel, hold, or limit any order for any lawful reason, including inventory issues, suspected fraud, compliance review, pricing mistakes, shipping limitations, payment problems, or product restrictions.',
          'Prices, product information, availability, discounts, shipping options, and promotions may change without notice.',
          'We attempt to display product information accurately, but we do not warrant that descriptions, images, prices, inventory counts, or other content are error-free, complete, current, or suitable for your intended purpose.',
          'If a product is listed incorrectly, priced incorrectly, unavailable, or restricted, our sole obligation is to cancel, correct, substitute with approval, refund, or issue store credit where appropriate.',
        ]} />
      </LegalSection>

      <LegalSection title="6. Payments and separate checkout flows">
        <P>
          Pryme Labs may offer different payment methods for different departments. Main storefront merchandise and non-restricted departments may support card checkout through Stripe or other approved processors. Peptide and research-use products may use a separate cart and separate manual checkout options, subject to verification and compliance review.
        </P>
        <LegalList items={[
          'Card payments are processed by third-party payment processors. Pryme Labs does not store full card numbers.',
          'Manual payments, including Zelle, Cash App, Venmo, or similar options where available, remain pending until verified by Pryme Labs.',
          'You agree to provide accurate payment information and to pay all charges, taxes, shipping, handling, and other amounts shown at checkout.',
          'Do not submit false payment confirmations. False payment claims, chargeback abuse, payment reversal abuse, or fraudulent disputes may result in account termination, order cancellation, collection activity, and refusal of future service.',
          'For manual payments, include the order number when instructed. Missing order information may delay verification or fulfillment.',
        ]} />
      </LegalSection>

      <LegalSection title="7. Shipping, delivery, risk of loss, and address accuracy">
        <LegalList items={[
          'You are responsible for entering a complete, accurate, deliverable shipping address and contact information.',
          'Shipping estimates are estimates only and are not guarantees. Carrier delays, weather, address problems, compliance holds, inventory holds, and payment-verification delays may affect delivery timing.',
          'Risk of loss may pass to you when an order is delivered to the carrier, to the extent permitted by law, unless otherwise required by the selected shipping method or applicable consumer-protection law.',
          'We may refuse to ship to certain addresses, regions, forwarding services, P.O. boxes, high-risk destinations, or locations where we believe shipment may violate law, carrier policy, payment policy, or compliance requirements.',
          'If a package is returned due to an incorrect address, refusal, failed delivery, or failure to pick up, you may be responsible for reshipping fees, carrier fees, and any non-refundable costs.',
        ]} />
      </LegalSection>

      <LegalSection title="8. Returns, refunds, cancellations, and claims">
        <LegalList items={[
          'Inspect your order promptly upon delivery. Report missing, damaged, incorrect, or defective items within 7 days of delivery with your order number and clear photos where applicable.',
          'Unopened eligible consumer merchandise may be considered for return within 14 days, subject to approval, product category, condition, and applicable law.',
          'Opened, used, altered, contaminated, temperature-abused, final-sale, clearance, personalized, or restricted products may not be returnable unless required by law or approved by Pryme Labs.',
          'Research-use products may be subject to stricter return limitations because of chain-of-custody, integrity, safety, and compliance concerns.',
          'Approved refunds may be issued to the original payment method, as store credit, or by another reasonable method depending on the payment type and circumstances.',
          'Shipping fees, payment-processing fees, carrier fees, and other third-party fees may be non-refundable unless required by law.',
          'We may cancel unfulfilled orders before shipment and issue an appropriate refund or credit where required.',
        ]} />
      </LegalSection>

      <LegalSection title="9. No medical, health, fitness, or professional advice">
        <P>
          The site, product descriptions, educational material, blog-style copy, emails, SMS messages, labels, certificates, and support communications are provided for general informational and commerce purposes only. They are not medical advice, health advice, legal advice, regulatory advice, laboratory-safety advice, or a substitute for professional judgment.
        </P>
        <P>
          Consult a qualified physician, pharmacist, attorney, compliance professional, laboratory safety professional, or other appropriate professional for advice specific to your situation.
        </P>
      </LegalSection>

      <LegalSection title="10. Prohibited conduct">
        <LegalList items={[
          'Using the site or products for unlawful, unsafe, deceptive, fraudulent, abusive, or unauthorized purposes.',
          'Attempting to bypass peptide verification, account security, purchase restrictions, payment controls, rate limits, or administrative protections.',
          'Scraping, copying, reverse engineering, attacking, probing, scanning, or interfering with the site, APIs, checkout, accounts, admin tools, or security systems.',
          'Submitting false information, impersonating another person, using another person’s payment method without authorization, or creating duplicate accounts to avoid restrictions.',
          'Making disease, therapeutic, diagnostic, drug, or human-use claims about research-use products or using our content to promote unlawful resale or misuse.',
        ]} />
      </LegalSection>

      <LegalSection title="11. Intellectual property">
        <P>
          The Pryme Labs name, logos, product names, department names, brand names, site design, graphics, copy, images, software, code, data, and other content are owned by or licensed to Pryme Labs and are protected by intellectual-property and unfair-competition laws. You may not copy, reproduce, modify, distribute, display, scrape, frame, resell, or exploit site content without written permission.
        </P>
      </LegalSection>

      <LegalSection title="12. Third-party services">
        <P>
          Our site may rely on third-party services such as payment processors, shipping carriers, email providers, SMS providers, analytics/security tools, address-autocomplete services, fraud-prevention providers, hosting providers, and other operational vendors. Your use of those services may be subject to their own terms and privacy policies. We are not responsible for third-party systems outside our control.
        </P>
      </LegalSection>

      <LegalSection title="13. Disclaimers and limitation of liability">
        <P>
          To the fullest extent permitted by law, the site and products are provided “as is” and “as available,” without warranties of any kind, whether express, implied, statutory, or otherwise. We disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, uninterrupted operation, and error-free service.
        </P>
        <P>
          To the fullest extent permitted by law, Pryme Labs will not be liable for indirect, incidental, special, consequential, exemplary, punitive, or enhanced damages; lost profits; lost revenue; lost data; loss of goodwill; business interruption; personal injury resulting from misuse; unlawful use; or damages arising from third-party services, carriers, payment processors, or unauthorized account activity.
        </P>
        <P>
          Some jurisdictions do not allow certain limitations, so some limitations may not apply to you. Nothing in these Terms limits rights that cannot be limited under applicable law.
        </P>
      </LegalSection>

      <LegalSection title="14. Indemnification">
        <P>
          To the fullest extent permitted by law, you agree to defend, indemnify, and hold harmless Pryme Labs, Pryme Research Group LLC, owners, employees, contractors, vendors, service providers, and affiliates from and against claims, damages, losses, liabilities, costs, and expenses, including reasonable attorneys’ fees, arising from your violation of these Terms, misuse of products, unlawful conduct, false information, unauthorized account activity, chargeback abuse, or violation of another party’s rights.
        </P>
      </LegalSection>

      <LegalSection title="15. Governing law, disputes, and venue">
        <P>
          These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law rules. Before filing a claim, you agree to contact us and attempt to resolve the dispute informally. To the fullest extent permitted by law, disputes must be brought individually and not as a class, collective, consolidated, or representative action. Venue for any permitted court proceeding will be in the state or federal courts located in Texas, unless applicable law requires otherwise.
        </P>
      </LegalSection>

      <LegalSection title="16. Contact">
        <P>
          Questions about these Terms may be sent to Pryme Labs using the contact information below.
        </P>
        <ContactBlock />
      </LegalSection>
    </LegalShell>
  )
}
