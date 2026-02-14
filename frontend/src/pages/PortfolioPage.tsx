import { portfolioData } from '../data/portfolioData';
import './PortfolioPage.css';

const navItems = [
  { label: 'About', href: '#about' },
  { label: 'Experience', href: '#experience' },
  { label: 'Projects', href: '#projects' },
  { label: 'Education', href: '#education' },
  { label: 'Skills', href: '#skills' },
  { label: 'Awards', href: '#awards' },
  { label: 'Contact', href: '#contact' },
];

const isHttpUrl = (href: string) => /^https?:\/\//i.test(href);

function PortfolioPage() {
  const {
    personal,
    social,
    statusPills,
    stats,
    highlights,
    experiences,
    projects,
    skills,
    education,
    certifications,
    achievements,
  } = portfolioData;

  return (
    <div className="portfolio-page">
      <div className="noise-overlay" aria-hidden="true" />

      <header className="portfolio-nav">
        <a href="#home" className="brand-lockup">
          <span className="brand-block">g.</span>
          <span className="brand-copy">{personal.name}</span>
        </a>

        <nav className="nav-links" aria-label="Section links">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="portfolio-actions">
          <a className="yearbook-button" href="/">
            Yearbook
          </a>
          <a
            className="resume-button"
            href="/Gaurav%20Kumar%20Verma.pdf"
            download="Gaurav-Kumar-Verma-Resume.pdf"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.29a1 1 0 1 1 1.4 1.41l-4 3.99a1 1 0 0 1-1.4 0l-4-3.99a1 1 0 1 1 1.4-1.41L11 12.59V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
            </svg>
            <span>Resume</span>
          </a>
        </div>
      </header>

      <main className="portfolio-main" id="home">
        <section className="hero-section reveal-up">
          <div className="hero-copy">
            <p className="hero-label">GEN-Z BUILDER MODE</p>
            <h1>
              {personal.name}
              <span>{personal.headline}</span>
            </h1>
            <p className="hero-tagline">{personal.tagline}</p>
            <p className="hero-summary">{personal.summary}</p>

            <div className="status-pills">
              {statusPills.map((pill) => (
                <span key={pill}>{pill}</span>
              ))}
            </div>

            <div className="cta-row">
              {social.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={isHttpUrl(link.href) ? '_blank' : undefined}
                  rel={isHttpUrl(link.href) ? 'noreferrer' : undefined}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <aside className="hero-stack">
            <div className="identity-card reveal-up delay-1">
              <div>
                <p className="label">Location</p>
                <strong>{personal.location}</strong>
              </div>
              <div>
                <p className="label">Email</p>
                <a href={`mailto:${personal.email}`}>{personal.email}</a>
              </div>
              <div>
                <p className="label">Phone</p>
                <a href={`tel:${personal.phone}`}>{personal.phone}</a>
              </div>
            </div>

            <article className="current-status-card reveal-up delay-2">
              <p className="label">Current</p>
              <h3>Indie Developer and Freelance Builder</h3>
              <p>
                Shipping product ideas end-to-end, taking selective freelance projects,
                and partnering with teams that need fast, reliable execution.
              </p>
              <div className="status-trackers">
                <span>Open to freelance work</span>
                <span>Product-focused builds</span>
              </div>
            </article>

            <div className="stat-grid reveal-up delay-2">
              {stats.map((item) => (
                <article key={item.label}>
                  <h3>{item.value}</h3>
                  <p>{item.label}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="section reveal-up" id="about">
          <header className="section-headline">
            <p>About</p>
            <h2>What I bring</h2>
          </header>

          <div className="highlight-list">
            {highlights.map((point) => (
              <article key={point}>{point}</article>
            ))}
          </div>
        </section>

        <section className="section reveal-up" id="experience">
          <header className="section-headline">
            <p>Experience</p>
            <h2>Where I worked</h2>
          </header>

          <div className="timeline-list">
            {experiences.map((item) => (
              <article key={`${item.role}-${item.company}`} className="timeline-item">
                <div className="timeline-meta">
                  <p>{item.period}</p>
                  <span>{item.location}</span>
                </div>
                <div className="timeline-content">
                  <h3>{item.role}</h3>
                  <h4>{item.company}</h4>
                  <ul>
                    {item.highlights.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section reveal-up" id="projects">
          <header className="section-headline">
            <p>Projects</p>
            <h2>Builds that matter</h2>
          </header>

          <div className="project-grid">
            {projects.map((project) => (
              <article key={project.name} className="project-card">
                <div className="project-top">
                  <span>{project.period}</span>
                  <h3>{project.name}</h3>
                </div>

                <p>{project.summary}</p>
                <p className="project-impact">{project.impact}</p>

                <div className="chip-row">
                  {project.stack.map((tech) => (
                    <span key={`${project.name}-${tech}`}>{tech}</span>
                  ))}
                </div>

                {project.links.length ? (
                  <div className="project-links">
                    {project.links.map((link) => (
                      <a
                        key={`${project.name}-${link.label}`}
                        href={link.href}
                        target={isHttpUrl(link.href) ? '_blank' : undefined}
                        rel={isHttpUrl(link.href) ? 'noreferrer' : undefined}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="section reveal-up" id="skills">
          <header className="section-headline">
            <p>Skills</p>
            <h2>Tools I use</h2>
          </header>

          <div className="skills-grid">
            {skills.map((group) => (
              <article key={group.category}>
                <h3>{group.category}</h3>
                <div className="chip-row">
                  {group.items.map((item) => (
                    <span key={`${group.category}-${item}`}>{item}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section split reveal-up" id="education">
          <div>
            <header className="section-headline">
              <p>Education</p>
              <h2>Academic foundation</h2>
            </header>

            <div className="stacked-cards">
              {education.map((item) => (
                <article key={`${item.institution}-${item.degree}`}>
                  <h3>{item.degree}</h3>
                  <h4>{item.institution}</h4>
                  <p>{item.period}</p>
                  <p>{item.notes}</p>
                </article>
              ))}
            </div>
          </div>

          <div>
            <header className="section-headline">
              <p>Programs and Roles</p>
              <h2>Leadership and recognition</h2>
            </header>

            <div className="stacked-cards">
              {certifications.map((item) => (
                <article key={`${item.name}-${item.issuer}`}>
                  <h3>{item.name}</h3>
                  <h4>{item.issuer}</h4>
                  <p>{item.year}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section reveal-up" id="awards">
          <header className="section-headline">
            <p>Honors and Awards</p>
            <h2>Recognition timeline</h2>
          </header>

          <ul className="achievement-list">
            {achievements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="contact-section reveal-up" id="contact">
          <p>Let&apos;s build</p>
          <h2>Open for impactful engineering work</h2>
          <div className="contact-links">
            <a href={`mailto:${personal.email}`}>Email</a>
            <a href={`tel:${personal.phone}`}>Call</a>
            {social.slice(0, 2).map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={isHttpUrl(link.href) ? '_blank' : undefined}
                rel={isHttpUrl(link.href) ? 'noreferrer' : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default PortfolioPage;
