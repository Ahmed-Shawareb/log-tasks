"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpRight, Briefcase, LayoutDashboard, LogIn, Menu, X } from 'lucide-react';

const navLinks = [
{ label: 'About', href: '#about' },
{ label: 'Services', href: '#services' },
{ label: 'Work', href: '#showreel' },
{ label: 'Contact', href: '#contact' }];


/** Where the Login menu goes: the team's system, and each client's dashboard. */
export type SignedIn = { staff: boolean; client: 'portal' | 'space' | null };

export default function Navbar({ signedIn = { staff: false, client: null } }: { signedIn?: SignedIn }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const logins = [
    { href: signedIn.staff ? '/dashboard' : '/login', icon: Briefcase, title: signedIn.staff ? 'Open the LOG system' : 'Team login', hint: 'For the LOG team: tasks, planner, clients' },
    { href: signedIn.client ? `/${signedIn.client}` : '/portal/login', icon: LayoutDashboard, title: signedIn.client ? 'Open your dashboard' : 'Client dashboard', hint: 'For clients: your feed, deliverables and dates' },
  ];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: [0.85, 0, 0.15, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${
          scrolled
            ? 'bg-log-pearl/95 backdrop-blur-xl border-b border-log-black/10'
            : 'bg-log-black/60 backdrop-blur-sm'
        }`}>
        
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <a href="#" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2">
            <span className={`text-xl md:text-2xl font-black tracking-tighter transition-colors duration-500 ${scrolled ? 'text-log-black' : 'text-log-pearl'}`}>LOG</span>
            <span className={`hidden sm:block text-[10px] font-medium tracking-[0.2em] uppercase transition-colors duration-500 ${scrolled ? 'text-log-grey' : 'text-log-pearl/60'}`}>Lots of Growth</span>
          </a>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-10">
            {navLinks.map((link) =>
            <button
              key={link.label}
              onClick={() => scrollTo(link.href)}
              className={`text-xs font-semibold tracking-[0.15em] uppercase transition-colors duration-300 relative group ${scrolled ? 'text-log-grey hover:text-log-black' : 'text-log-pearl/70 hover:text-log-pearl'}`}>
              
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-log-red group-hover:w-full transition-all duration-500" />
              </button>
            )}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <div className="relative" onMouseLeave={() => setLoginOpen(false)}>
              <button
                onClick={() => setLoginOpen((o) => !o)} onMouseEnter={() => setLoginOpen(true)} aria-expanded={loginOpen} aria-haspopup="menu"
                className={`flex items-center gap-2 text-xs font-bold tracking-[0.15em] uppercase px-5 py-3 border transition-colors duration-500 ${scrolled ? 'border-log-black/20 text-log-black hover:border-log-black' : 'border-log-pearl/30 text-log-pearl hover:border-log-pearl'}`}>
                <LogIn size={14} /> {signedIn.staff || signedIn.client ? 'Dashboard' : 'Login'}
              </button>
              <AnimatePresence>
                {loginOpen && (
                  <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full pt-2 w-72">
                    <div className="bg-log-black border border-log-pearl/10 shadow-2xl">
                      {logins.map((l) => (
                        <a key={l.href} href={l.href} role="menuitem" className="group flex items-start gap-3 px-5 py-4 border-b border-log-pearl/10 last:border-b-0 hover:bg-log-pearl/5 transition-colors">
                          <l.icon size={16} className="mt-0.5 text-log-red" />
                          <span className="flex-1">
                            <span className="flex items-center justify-between text-xs font-bold tracking-[0.15em] uppercase text-log-pearl">{l.title}<ArrowUpRight size={14} className="text-log-pearl/40 group-hover:text-log-pearl transition-colors" /></span>
                            <span className="block mt-1 text-[11px] text-log-pearl/45">{l.hint}</span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => scrollTo('#contact')}
              className={`text-xs font-bold tracking-[0.15em] uppercase px-6 py-3 transition-colors duration-500 ${scrolled ? 'bg-log-black text-log-pearl hover:bg-log-red' : 'bg-log-pearl text-log-black hover:bg-log-red hover:text-log-pearl'}`}>
              
              Start a Project
            </button>
          </div>

          {/* Mobile Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`md:hidden w-10 h-10 flex items-center justify-center transition-colors duration-500 ${scrolled ? 'text-log-black' : 'text-log-pearl'}`}>
            
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen &&
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: [0.85, 0, 0.15, 1] }}
          className="fixed inset-0 z-40 bg-log-pearl flex flex-col items-center justify-center gap-8">
          
            {navLinks.map((link, i) =>
          <motion.button
            key={link.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            onClick={() => scrollTo(link.href)}
            className="text-3xl font-black tracking-tight text-log-black">
            
                {link.label}
              </motion.button>
          )}
            <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            onClick={() => scrollTo('#contact')}
            className="mt-4 text-sm font-bold tracking-[0.15em] uppercase px-8 py-4 bg-log-black text-log-pearl">
            
              Start a Project
            </motion.button>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-6 flex w-full max-w-xs flex-col gap-2 border-t border-log-black/10 pt-6">
              {logins.map((l) => (
                <a key={l.href} href={l.href} className="flex items-center justify-center gap-2 border border-log-black/20 px-6 py-3 text-xs font-bold tracking-[0.15em] uppercase text-log-black">
                  <l.icon size={14} /> {l.title}
                </a>
              ))}
            </motion.div>
          </motion.div>
        }
      </AnimatePresence>
    </>);

}