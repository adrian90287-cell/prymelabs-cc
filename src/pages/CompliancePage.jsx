import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import CartSidebar from '../components/CartSidebar'
import { useT } from '../context/LanguageContext'

function Section({ title, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
      <h2 className="text-white font-bold text-lg border-b border-zinc-800 pb-3">{title}</h2>
      <div className="text-zinc-400 text-sm leading-relaxed space-y-3">{children}</div>
    </div>
  )
}

function P({ children }) {
  return <p>{children}</p>
}

function UL({ items }) {
  return (
    <ul className="list-none space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-blue-500 shrink-0 mt-0.5">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function CompliancePage() {
  const navigate = useNavigate()
  const t = useT()
  const isEs = t.lang === 'ES'

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <CartSidebar />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <button onClick={() => navigate('/shop')}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t.compliance.backToShop}
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">{t.compliance.title}</h1>
          <p className="text-zinc-500 mt-1.5">{t.compliance.subtitle}</p>
        </div>

        {/* Important notice — applies across all product categories */}
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h2 className="text-amber-400 font-bold text-base mb-2">{isEs ? 'Aviso Importante' : 'Important Notice'}</h2>
              {isEs ? (
                <div className="text-amber-200/80 text-sm leading-relaxed space-y-2">
                  <p>Pryme Labs ofrece productos en varias categorías — <strong className="text-amber-300">péptidos de investigación, suplementos dietéticos, y productos cosméticos, de cuidado personal y aseo</strong>. Cada categoría se rige por sus propios términos y advertencias, que se detallan a continuación.</p>
                  <p>Lea la advertencia correspondiente a la categoría del producto que va a comprar. Nada en este sitio constituye asesoramiento médico. Usted es responsable de usar los productos legalmente y de acuerdo con sus etiquetas e instrucciones.</p>
                </div>
              ) : (
                <div className="text-amber-200/80 text-sm leading-relaxed space-y-2">
                  <p>Pryme Labs offers products across several categories — <strong className="text-amber-300">research peptides, dietary supplements, and cosmetic, personal-care & grooming products</strong>. Each category is governed by its own terms and disclaimers, detailed below.</p>
                  <p>Please read the disclaimer for the category of product you are purchasing. Nothing on this site constitutes medical advice. You are responsible for using products lawfully and in accordance with their labels and instructions.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Product Category Disclaimers */}
          <Section title={isEs ? 'Advertencias por Categoría de Producto' : 'Product Category Disclaimers'}>
            {isEs ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1.5">🧬 Péptidos de Investigación y Químicos de Investigación</h3>
                  <UL items={[
                    'Estrictamente para uso de laboratorio e investigación. NO para consumo humano o animal, ni para uso terapéutico, diagnóstico o clínico.',
                    'Al comprar, usted confirma que es un investigador o profesional calificado que compra para fines de investigación legítimos.',
                    'Debe tener 21 años o más para comprar.',
                    'No se hacen afirmaciones sobre la seguridad o eficacia para uso humano. Se venden únicamente como reactivos de investigación.',
                  ]} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1.5">💊 Suplementos Dietéticos y Bienestar</h3>
                  <UL items={[
                    'Estas declaraciones no han sido evaluadas por la Administración de Alimentos y Medicamentos (FDA).',
                    'Estos productos no están destinados a diagnosticar, tratar, curar ni prevenir ninguna enfermedad.',
                    'Consulte a un médico antes de usarlos, especialmente si está embarazada, amamantando, tomando medicamentos o tiene una condición médica.',
                    'Mantener fuera del alcance de los niños. No exceda el uso recomendado. Suspenda el uso y consulte a un médico si ocurren efectos adversos.',
                    'Los resultados individuales pueden variar.',
                  ]} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1.5">🧴 Cosméticos, Cuidado de la Piel y Aseo Personal</h3>
                  <UL items={[
                    'Solo para uso externo/tópico. Evite el contacto con los ojos; si ocurre, enjuague bien con agua.',
                    'Realice una prueba de parche antes del primer uso; suspenda el uso si se produce irritación, enrojecimiento o molestia.',
                    'No están destinados a tratar ni prevenir ninguna enfermedad de la piel o condición médica.',
                    'Mantener fuera del alcance de los niños. Almacene según las indicaciones.',
                    'Estos productos no han sido evaluados por la FDA.',
                  ]} />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1.5">🧬 Research Peptides & Research Chemicals</h3>
                  <UL items={[
                    'Strictly for laboratory and research use only. NOT for human or animal consumption, therapeutic, diagnostic, or clinical use.',
                    'By purchasing, you confirm you are a qualified researcher or professional buying for legitimate research purposes.',
                    'You must be 21 years or older to purchase.',
                    'No claims are made regarding safety or efficacy for human use. Sold as research reagents only.',
                  ]} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1.5">💊 Dietary Supplements & Wellness</h3>
                  <UL items={[
                    'These statements have not been evaluated by the Food and Drug Administration (FDA).',
                    'These products are not intended to diagnose, treat, cure, or prevent any disease.',
                    'Consult a physician before use — especially if pregnant, nursing, taking medication, or if you have a medical condition.',
                    'Keep out of reach of children. Do not exceed recommended use. Discontinue and consult a doctor if adverse effects occur.',
                    'Individual results may vary.',
                  ]} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1.5">🧴 Cosmetics, Skin Care & Grooming</h3>
                  <UL items={[
                    'For external/topical use only. Avoid contact with eyes; if contact occurs, rinse thoroughly with water.',
                    'Patch test before first use; discontinue use if irritation, redness, or discomfort occurs.',
                    'Not intended to treat or prevent any skin disease or medical condition.',
                    'Keep out of reach of children. Store as directed.',
                    'These products have not been evaluated by the FDA.',
                  ]} />
                </div>
              </div>
            )}
          </Section>

          {/* Support / Contact */}
          <Section title={t.compliance.supportTitle}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">{t.compliance.supportEmail}</div>
                <a href="mailto:support@prymelabs.net" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                  support@prymelabs.net
                </a>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">{t.compliance.supportPhone}</div>
                <a href="tel:+13465509100" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                  (346) 550-9100
                </a>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2 sm:col-span-2">
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">{t.compliance.supportHours}</div>
                <p className="text-white font-medium">{t.compliance.supportHoursValue}</p>
              </div>
            </div>
          </Section>

          {/* Terms of Service */}
          <Section title={t.compliance.terms}>
            {isEs ? (
              <>
                <P>Al acceder y comprar en prymelabs.cc, usted acepta estos términos de servicio en su totalidad.</P>
                <UL items={[
                  'Debe tener 21 años o más para comprar. Nos reservamos el derecho de verificar la edad y cancelar pedidos de compradores menores de edad.',
                  'Cada producto se vende sujeto a la advertencia específica de su categoría indicada arriba. Los químicos de investigación son solo para uso de laboratorio y no para consumo; los suplementos dietéticos y productos de cuidado personal son bienes de consumo que deben usarse solo según su etiqueta e indicaciones.',
                  'Usted asume toda la responsabilidad por el uso de los productos adquiridos, asegurándose de que cumplen con todas las leyes y regulaciones locales, estatales y federales aplicables.',
                  'La reventa o distribución de químicos de investigación a personas para consumo humano está estrictamente prohibida.',
                  'Los precios están sujetos a cambios sin previo aviso. Los precios indicados son en dólares estadounidenses (USD).',
                  'Pryme Labs se reserva el derecho de rechazar o cancelar cualquier pedido por cualquier motivo, incluyendo pero no limitado a la disponibilidad del producto, errores en la descripción o el precio.',
                  'El acceso no autorizado, la reproducción o la redistribución del contenido está estrictamente prohibida.',
                  'Estos términos pueden actualizarse periódicamente. El uso continuado del sitio constituye la aceptación de los términos actualizados.',
                ]} />
              </>
            ) : (
              <>
                <P>By accessing and purchasing from prymelabs.cc, you agree to these terms of service in their entirety.</P>
                <UL items={[
                  'You must be 21 years or older to purchase. We reserve the right to verify age and cancel orders from underage purchasers.',
                  'Each product is sold subject to its category-specific disclaimer above. Research chemicals are for laboratory research use only and not for consumption; dietary supplements and personal-care products are consumer goods to be used only as labeled and directed.',
                  'You assume full responsibility for the use of products purchased, ensuring they comply with all applicable local, state, and federal laws and regulations.',
                  'Reselling or distributing research chemicals to individuals for human consumption is strictly prohibited.',
                  'Prices are subject to change without notice. All prices listed are in US Dollars (USD).',
                  'Pryme Labs reserves the right to refuse or cancel any order for any reason, including but not limited to product availability, errors in description or pricing.',
                  'Unauthorized access, reproduction, or redistribution of content is strictly prohibited.',
                  'These terms may be updated periodically. Continued use of the site constitutes acceptance of updated terms.',
                ]} />
              </>
            )}
          </Section>

          {/* Refund & Claims */}
          <Section title={t.compliance.refunds}>
            {isEs ? (
              <>
                <P>Queremos que estés completamente satisfecho con tu pedido. Por favor, revisa la siguiente política antes de realizar una compra.</P>
                <UL items={[
                  'Inspecciona tu pedido al recibirlo. Todas las reclamaciones deben presentarse dentro de los 7 días posteriores a la entrega.',
                  'Productos dañados o defectuosos: comunícate con support@prymelabs.net dentro de los 7 días con fotos del daño y tu número de pedido.',
                  'Los reembolsos de productos defectuosos o incorrectos se emitirán como crédito en tienda o al método de pago original a nuestra discreción.',
                  'No se aceptan devoluciones de productos abiertos o usados a menos que sean defectuosos.',
                  'Los artículos no abiertos que califiquen para devolución deben ser devueltos en su embalaje original dentro de los 14 días. El comprador paga el envío de devolución.',
                  'Los reembolsos por pagos de Zelle, Cash App o Venmo se procesarán dentro de 5-7 días hábiles.',
                  'Pryme Labs no es responsable de paquetes perdidos o dañados después de haber sido entregados al transportista. Comunícate con nosotros para recibir asistencia con reclamaciones.',
                  'Los pedidos cancelados antes del envío recibirán reembolso completo menos los cargos de procesamiento de pago aplicables.',
                ]} />
              </>
            ) : (
              <>
                <P>We want you to be completely satisfied with your order. Please review the following policy before making a purchase.</P>
                <UL items={[
                  'Inspect your order upon receipt. All claims must be submitted within 7 days of delivery.',
                  'Damaged or defective products: contact support@prymelabs.net within 7 days with photos of the damage and your order number.',
                  'Refunds for defective or incorrect products will be issued as store credit or to the original payment method at our discretion.',
                  'Returns are not accepted on opened or used products unless defective.',
                  'Unopened items qualifying for return must be returned in original packaging within 14 days. Buyer pays return shipping.',
                  'Refunds for Zelle, Cash App, or Venmo payments will be processed within 5–7 business days.',
                  'Pryme Labs is not responsible for lost or damaged packages after being handed to the carrier. Contact us for assistance with claims.',
                  'Orders cancelled before shipment will receive a full refund minus any applicable payment processing fees.',
                ]} />
              </>
            )}
          </Section>

          {/* Privacy Policy */}
          <Section title={t.compliance.privacy}>
            {isEs ? (
              <>
                <P>Pryme Labs se compromete a proteger tu privacidad. Esta política describe cómo recopilamos, usamos y protegemos tu información.</P>
                <UL items={[
                  'Información recopilada: nombre, dirección de correo electrónico, dirección de envío y método de pago para el procesamiento de pedidos.',
                  'No vendemos, alquilamos ni compartimos tu información personal con terceros para fines de marketing.',
                  'Los datos de pedidos se conservan con fines de cumplimiento y pueden ser accedidos por personal autorizado de Pryme Labs.',
                  'Tu contraseña se almacena encriptada. Nunca compartiremos tu contraseña con nadie.',
                  'Usamos cookies de sesión esenciales para mantener el estado de inicio de sesión y el carrito de compras. No utilizamos cookies de seguimiento de terceros.',
                  'Las comunicaciones por correo electrónico se envían solo con tu consentimiento. Puedes cancelar tu suscripción en cualquier momento desde la página de Mis Pedidos.',
                  'Para solicitudes de datos, correcciones o eliminación, comunícate con support@prymelabs.net.',
                  'Esta política puede actualizarse periódicamente. Los cambios se notificarán por correo electrónico o mediante aviso en el sitio.',
                ]} />
              </>
            ) : (
              <>
                <P>Pryme Labs is committed to protecting your privacy. This policy describes how we collect, use, and protect your information.</P>
                <UL items={[
                  'Information collected: name, email address, shipping address, and payment method for order processing.',
                  'We do not sell, rent, or share your personal information with third parties for marketing purposes.',
                  'Order data is retained for compliance purposes and may be accessed by authorized Pryme Labs personnel.',
                  'Your password is stored encrypted. We will never share your password with anyone.',
                  'We use essential session cookies to maintain login state and shopping cart. We do not use third-party tracking cookies.',
                  'Email communications are sent only with your consent. You may unsubscribe at any time from the My Orders page.',
                  'For data requests, corrections, or deletion, contact support@prymelabs.net.',
                  'This policy may be updated periodically. Changes will be notified via email or site notice.',
                ]} />
              </>
            )}
          </Section>
        </div>

        <p className="text-zinc-600 text-xs text-center mt-8">
          {t.compliance.lastUpdated} {new Date().toLocaleDateString(isEs ? 'es-MX' : 'en-US', { month: 'long', year: 'numeric' })} · Pryme Labs LLC · support@prymelabs.net
        </p>
      </main>

      <Footer />
    </div>
  )
}
