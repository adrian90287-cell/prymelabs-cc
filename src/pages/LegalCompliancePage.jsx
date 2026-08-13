import { ContactBlock, LegalList, LegalSection, LegalShell, NumberedList, P } from './legal/LegalDocument'

export default function LegalCompliancePage() {
  return (
    <LegalShell
      eyebrow="Pryme Labs compliance"
      title="Legal & Compliance"
      subtitle="Important product-category disclaimers, research-use restrictions, supplement and cosmetic notices, safety expectations, and purchasing responsibilities."
    >
      <LegalSection title="Important notice" tone="warning">
        <P>
          Pryme Labs operates a multi-department storefront. Product categories are not interchangeable. Research-use products are not consumer-use products. Dietary supplements are not drugs. Cosmetics are not medical treatments. Apparel and merchandise are consumer goods. You must read the product page, label, warnings, certificate information, and category-specific disclaimer before purchasing.
        </P>
        <P>
          Nothing on this website is medical advice, legal advice, regulatory advice, laboratory-safety advice, or a promise that a product is suitable for your intended purpose. You are responsible for legal, safe, and appropriate use.
        </P>
      </LegalSection>

      <LegalSection title="1. Peptides and research chemicals — research use only" tone="warning">
        <P>
          Products in the Peptides department and any product identified as a peptide, research chemical, research compound, reference material, reagent, laboratory material, or research-use item are sold strictly for lawful laboratory research use only.
        </P>
        <LegalList items={[
          'Not for human consumption.',
          'Not for animal consumption.',
          'Not for injection, ingestion, inhalation, topical application, compounding, therapeutic use, diagnostic use, clinical use, veterinary use, cosmetic use, or personal experimentation.',
          'Not a drug, medicine, dietary supplement, food, cosmetic, medical device, or consumer health product.',
          'Not evaluated by the FDA for safety, effectiveness, dosage, interactions, contraindications, purity for human use, therapeutic value, or suitability for any consumer purpose.',
          'Sold only to qualified buyers purchasing for legitimate research purposes and responsible for compliance with all applicable laws and protocols.',
        ]} />
      </LegalSection>

      <LegalSection title="2. Peptide purchaser certification">
        <P>
          By accessing the Peptides department, creating an account for peptide access, or purchasing research-use products, you certify and agree that:
        </P>
        <NumberedList items={[
          'You are at least 21 years old.',
          'You are a qualified researcher, professional, institution, laboratory, or authorized purchaser.',
          'Your purchase is for legitimate laboratory research only.',
          'You will not use any research-use product in or on humans or animals.',
          'You will not resell, relabel, distribute, promote, or transfer research-use products for consumer, therapeutic, diagnostic, veterinary, cosmetic, supplement, drug, or medical purposes.',
          'You understand that research-use products may require specialized storage, handling, documentation, safety equipment, disposal, and institutional oversight.',
          'You will comply with all federal, state, local, and institutional rules that apply to acquisition, possession, handling, storage, transport, research, and disposal.',
          'You accept full responsibility for misuse, mishandling, unauthorized resale, improper storage, unlawful use, or use inconsistent with the research-use designation.',
        ]} />
      </LegalSection>

      <LegalSection title="3. Dietary supplements and wellness products">
        <P>
          Dietary supplements and wellness products are sold as consumer products only when they are clearly presented as supplements or wellness items, and they must be used only as labeled. Statements regarding dietary supplements have not been evaluated by the Food and Drug Administration unless expressly stated otherwise.
        </P>
        <LegalList items={[
          'Dietary supplements are not intended to diagnose, treat, cure, or prevent any disease.',
          'Consult a physician or qualified health professional before use, especially if you are pregnant, nursing, taking medication, have a medical condition, are planning surgery, or are purchasing for a person with special health considerations.',
          'Do not exceed labeled directions. Discontinue use and consult a professional if adverse reactions occur.',
          'Keep out of reach of children. Store as directed on the label.',
          'Individual results vary. Product descriptions are not guarantees of results.',
          'Any general wellness, structure/function, or lifestyle language is intended only for lawful supplement communication and should not be read as a disease claim.',
        ]} />
      </LegalSection>

      <LegalSection title="4. Cosmetics, grooming, skin care, and personal-care products">
        <P>
          Cosmetic, grooming, hair-care, beard-care, skin-care, body-care, and personal-care products are intended only for their ordinary cosmetic or grooming use and only as labeled.
        </P>
        <LegalList items={[
          'For external use only unless the label clearly states otherwise.',
          'Avoid contact with eyes and mucous membranes. If contact occurs, rinse thoroughly with water.',
          'Patch test before first use. Discontinue if irritation, redness, discomfort, rash, burning, swelling, or other adverse reaction occurs.',
          'Do not use on broken, irritated, infected, or medically compromised skin unless directed by a qualified professional.',
          'Cosmetic products are not intended to diagnose, treat, cure, prevent, or mitigate any disease or medical condition.',
          'Descriptions of appearance, feel, texture, grooming performance, or cosmetic effect are not medical claims.',
        ]} />
      </LegalSection>

      <LegalSection title="5. Apparel, merchandise, drinkware, and gym accessories">
        <P>
          Apparel, merchandise, shaker cups, coffee cups, tumblers, drinkware, gym accessories, bags, and similar items are sold as consumer merchandise. Use each item only for its ordinary intended purpose and follow any care, washing, use, temperature, food-contact, and safety instructions provided with the product.
        </P>
      </LegalSection>

      <LegalSection title="6. Product information, certificates, and testing">
        <LegalList items={[
          'Product information, images, descriptions, certificates, batch details, and testing references are provided for transparency and commerce purposes.',
          'A certificate or test reference is not a medical endorsement, regulatory approval, FDA approval, suitability guarantee, or permission for human or animal use of research-use products.',
          'Testing results may apply only to the tested batch, sample, method, and date shown. Natural variation, storage conditions, and handling may affect product characteristics.',
          'If certificate information appears missing, unclear, inconsistent, or outdated, contact support before purchasing or using the product.',
        ]} />
      </LegalSection>

      <LegalSection title="7. No FDA approval or agency endorsement">
        <P>
          Unless a product page expressly states otherwise and provides legally sufficient context, Pryme Labs products are not represented as FDA-approved. The FDA does not approve dietary supplements for safety and effectiveness before sale in the same manner as drugs, and cosmetic claims must be truthful and not misleading. Research-use products are not offered as FDA-approved drugs, supplements, cosmetics, or medical products.
        </P>
        <P>
          No government agency, testing laboratory, payment processor, carrier, or service provider endorsement should be inferred from any logo, certificate, shipment, integration, payment option, or third-party service used by the site.
        </P>
      </LegalSection>

      <LegalSection title="8. Compliance controls and department access">
        <LegalList items={[
          'Pryme Labs may require account login, email verification, phone verification, two-factor steps, manual review, or other controls before certain departments or features are available.',
          'Peptide/research-use access may be restricted, reviewed, logged, revoked, or denied based on eligibility, account status, verification, payment behavior, compliance risk, or suspected misuse.',
          'Attempting to bypass access controls, misrepresent intended use, create duplicate accounts, or purchase restricted products through another department violates Pryme Labs policy.',
          'We may cancel, hold, refund, restrict, or refuse orders that present compliance, safety, legal, payment, shipping, or fraud risk.',
        ]} />
      </LegalSection>

      <LegalSection title="9. Customer safety and adverse events">
        <P>
          If you experience an unexpected reaction from a consumer product, discontinue use and contact a qualified health professional if needed. For emergencies, contact emergency services or poison control as appropriate. Pryme Labs support cannot diagnose, treat, advise on medical use, or recommend use of products for medical conditions.
        </P>
        <P>
          If you believe you received the wrong item, a damaged item, a compromised item, or an item with unclear labeling, do not use it. Contact support with your order number and photos.
        </P>
      </LegalSection>

      <LegalSection title="10. Shipping, storage, and handling compliance">
        <LegalList items={[
          'You are responsible for providing a lawful, accurate, secure, and deliverable address.',
          'Some products may have storage or handling expectations. Review the product page, label, insert, and packaging upon receipt.',
          'Do not use products that appear tampered with, contaminated, damaged, mislabeled, or otherwise compromised.',
          'Research-use materials must be handled, stored, documented, and disposed of according to appropriate laboratory procedures and applicable law.',
          'We may decline shipment where we believe a destination, carrier, order type, or customer profile creates legal, compliance, or safety concerns.',
        ]} />
      </LegalSection>

      <LegalSection title="11. Marketing, reviews, and prohibited claims">
        <P>
          Customers, affiliates, partners, reviewers, and resellers may not use Pryme Labs product names, images, content, packaging, certificates, or communications to make unlawful claims.
        </P>
        <LegalList items={[
          'Do not claim that a research-use product treats, prevents, cures, diagnoses, mitigates, improves, or affects any disease or health condition.',
          'Do not claim that a supplement treats, prevents, cures, diagnoses, or mitigates disease.',
          'Do not claim that a cosmetic product changes body structure/function or treats/prevents a disease unless the product is lawfully marketed for that use.',
          'Do not publish reviews or testimonials that promote unsafe, unlawful, medical, therapeutic, diagnostic, veterinary, or human-use claims for research-use products.',
          'We may remove or reject reviews, testimonials, affiliate content, or user content that creates legal, medical, safety, or compliance risk.',
        ]} />
      </LegalSection>

      <LegalSection title="12. Refund, complaint, and compliance contact">
        <P>
          For damaged, incorrect, missing, mislabeled, compromised, or concerning products, contact us promptly. Include your order number, product name, batch/lot information if available, photos, and a clear explanation. Do not use a product while a safety, identity, or labeling concern is unresolved.
        </P>
        <ContactBlock />
      </LegalSection>
    </LegalShell>
  )
}
