"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { motion } from "motion/react";

const socialLinks = [
  { label: 'Instagram', href: '#' },
  { label: 'LinkedIn', href: '#' },
  { label: 'X / Twitter', href: '#' },
  { label: 'TikTok', href: '#' },
];

export default function Footer() {
  return (
    <footer className="relative bg-log-black py-16 md:py-24">
      <div className="max-w-[1440px] mx-auto px-6 md:px-12">
        <div className="grid md:grid-cols-3 gap-12 md:gap-8 mb-16 md:mb-24">
          {/* Brand */}
          <div>
            <span className="text-3xl md:text-4xl font-black tracking-tighter text-log-pearl">LOG</span>
            <p className="text-xs text-log-pearl/40 mt-3 tracking-[0.1em]">Lots Of Growth</p>
            <p className="text-sm text-log-pearl/30 mt-4 max-w-xs leading-relaxed">
              We build what lasts. Full-spectrum marketing for brands that think long-term.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-pearl/30 mb-4">Navigation</h4>
              <div className="space-y-3">
                {['About', 'Services', 'Work', 'Contact'].map((link) => (
                  <a
                    key={link}
                    href={`#${link.toLowerCase()}`}
                    className="block text-sm text-log-pearl/60 hover:text-log-pearl transition-colors duration-300"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-pearl/30 mb-4">Social</h4>
              <div className="space-y-3">
                {socialLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-log-pearl/60 hover:text-log-red transition-colors duration-300"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-pearl/30 mb-4">Contact</h4>
            <div className="space-y-3">
              <p className="text-sm text-log-pearl/60">hello@lotagency.com</p>
              <p className="text-sm text-log-pearl/60">Global, Remote-first</p>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-log-pearl/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[10px] text-log-pearl/30 tracking-[0.2em] uppercase">
            © {new Date().getFullYear()} LOG — Lots Of Growth. All rights reserved.
          </p>
          <p className="text-[10px] text-log-pearl/20 tracking-[0.15em] uppercase">
            We Build What Lasts
          </p>
        </div>
      </div>
    </footer>
  );
}