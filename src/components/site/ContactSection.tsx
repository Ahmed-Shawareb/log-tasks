"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Check } from 'lucide-react';

const serviceOptions = ['UGC Content', 'Content Creation', 'Media Production', 'Performance Marketing', 'Branding & Strategy', 'Social Media Management'];
const budgetOptions = ['Under $5K', '$5K - $15K', '$15K - $50K', '$50K - $100K', '$100K+'];

function FloatingInput({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; required?: boolean }) {
  const [focused, setFocused] = useState(false);
  const active = focused || !!value;

  return (
    <div className="relative pt-5">
      <label className={`absolute left-0 pointer-events-none transition-all duration-300 ${active ? 'text-[10px] top-0 tracking-[0.2em] uppercase text-log-red font-semibold' : 'text-sm top-[1.1rem] text-log-grey'}`}>
        {label}
      </label>
      <input
        type={type} value={value} onChange={onChange} required={required}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        className="w-full pt-2 pb-3 bg-transparent border-b border-log-black/20 focus:border-log-red text-log-black text-sm font-medium outline-none transition-colors duration-300"
      />
    </div>
  );
}

export default function ContactSection() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ full_name: '', company_name: '', phone: '', email: '', service_needed: '', budget_range: '', message: '', website: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enquiries go to LOG's own system (admins get a notification and find them under Admin → Leads).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true); setError(null);
    try {
      const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Something went wrong. Please try again.');
      setSubmitted(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); }
    finally { setPending(false); }
  };
  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [field]: e.target.value });

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`Hi LOG! I'm ${form.full_name || 'interested'} from ${form.company_name || 'a company'}. I'd like to discuss ${form.service_needed || 'your services'}.`);
    window.open(`https://wa.me/201000013405?text=${text}`, '_blank');
  };

  return (
    <section id="contact" className="relative bg-log-pearl py-24 md:py-36 overflow-hidden border-t border-log-black/10">
      <div className="max-w-[1440px] mx-auto px-6 md:px-12">
        <div className="grid lg:grid-cols-2 gap-16 md:gap-24">
          {/* Left */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.7 }}
              className="flex items-center gap-4 mb-8"
            >
              <div className="w-10 h-[1px] bg-log-red" />
              <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-grey">Get In Touch</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-log-black leading-[0.95] mb-6"
            >
              Let's build<br />something<br /><span className="text-log-red">lasting.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
              viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.3 }}
              className="text-sm text-log-grey leading-relaxed max-w-sm mb-10"
            >
              Ready to initiate your growth? Fill out the form or reach us directly. We respond within 24 hours.
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.4 }}
              onClick={handleWhatsApp}
              className="group flex items-center gap-3 px-7 py-4 bg-log-black text-log-pearl text-xs font-bold tracking-[0.15em] uppercase hover:bg-log-red transition-colors duration-500 mb-12"
            >
              <MessageCircle size={15} />
              Book on WhatsApp
            </motion.button>

            <motion.div
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
              viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.5 }}
              className="space-y-3 pt-8 border-t border-log-black/10"
            >
              <p className="text-xs text-log-grey"><span className="font-semibold text-log-black">Email</span> — hello@lotagency.com</p>
              <p className="text-xs text-log-grey"><span className="font-semibold text-log-black">Based in</span> — Global, Remote-first</p>
            </motion.div>
          </div>

          {/* Right — Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.25 }}
          >
            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center min-h-[400px] text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-log-red flex items-center justify-center mb-6">
                    <Check size={22} className="text-log-pearl" />
                  </div>
                  <h3 className="text-2xl font-black text-log-black mb-2">Growth Initiated</h3>
                  <p className="text-sm text-log-grey">We'll be in touch within 24 hours.</p>
                </motion.div>
              ) : (
                <form key="form" onSubmit={handleSubmit} className="space-y-7">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <FloatingInput label="Full Name" value={form.full_name} onChange={update('full_name')} required />
                    <FloatingInput label="Company Name" value={form.company_name} onChange={update('company_name')} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <FloatingInput label="Email" value={form.email} onChange={update('email')} type="email" required />
                    <FloatingInput label="Phone Number" value={form.phone} onChange={update('phone')} type="tel" />
                  </div>

                  <div className="pt-5">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-log-grey font-semibold block mb-2">Service Needed</label>
                    <select value={form.service_needed} onChange={update('service_needed')} className="w-full pb-3 bg-transparent border-b border-log-black/20 focus:border-log-red text-log-black text-sm font-medium outline-none appearance-none cursor-pointer">
                      <option value="">Select a service</option>
                      {serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="pt-2">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-log-grey font-semibold block mb-2">Budget Range</label>
                    <select value={form.budget_range} onChange={update('budget_range')} className="w-full pb-3 bg-transparent border-b border-log-black/20 focus:border-log-red text-log-black text-sm font-medium outline-none appearance-none cursor-pointer">
                      <option value="">Select budget range</option>
                      {budgetOptions.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>

                  <div className="pt-2">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-log-grey font-semibold block mb-2">Message</label>
                    <textarea value={form.message} onChange={update('message')} rows={3} placeholder="Tell us about your project..." className="w-full pb-3 bg-transparent border-b border-log-black/20 focus:border-log-red text-log-black text-sm font-medium outline-none resize-none" />
                  </div>

                  {/* Honeypot: hidden from people, bots fill it in */}
                  <input type="text" name="website" value={form.website} onChange={update('website')} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
                  {error && <p role="alert" className="text-xs font-semibold text-log-red">{error}</p>}
                  <button
                    type="submit"
                    disabled={pending}
                    className="group relative w-full py-5 bg-log-black text-log-pearl text-xs font-bold tracking-[0.2em] uppercase overflow-hidden disabled:opacity-50 mt-4"
                  >
                    <span className="absolute inset-0 bg-log-red -translate-x-full group-hover:translate-x-0 transition-transform duration-700 ease-[cubic-bezier(0.85,0,0.15,1)]" />
                    <span className="relative">{pending ? 'Sending...' : 'Initiate Growth'}</span>
                  </button>
                </form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}