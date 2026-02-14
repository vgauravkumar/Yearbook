export type SocialLink = {
  label: string;
  href: string;
};

export type StatItem = {
  value: string;
  label: string;
};

export type ExperienceItem = {
  role: string;
  company: string;
  period: string;
  location: string;
  highlights: string[];
};

export type ProjectItem = {
  name: string;
  period: string;
  stack: string[];
  summary: string;
  impact: string;
  links: SocialLink[];
};

export type SkillGroup = {
  category: string;
  items: string[];
};

export type EducationItem = {
  institution: string;
  degree: string;
  period: string;
  notes: string;
};

export type CertificationItem = {
  name: string;
  issuer: string;
  year: string;
};

export type PortfolioData = {
  personal: {
    name: string;
    headline: string;
    tagline: string;
    location: string;
    email: string;
    phone: string;
    resumeHref: string;
    summary: string;
  };
  social: SocialLink[];
  statusPills: string[];
  stats: StatItem[];
  highlights: string[];
  experiences: ExperienceItem[];
  projects: ProjectItem[];
  skills: SkillGroup[];
  education: EducationItem[];
  certifications: CertificationItem[];
  achievements: string[];
};

export const portfolioData: PortfolioData = {
  personal: {
    name: 'Gaurav Kumar Verma',
    headline: 'Full-Stack Developer',
    tagline: 'Building scalable backend systems, useful products, and clean user experiences.',
    location: 'Bengaluru, India',
    email: 'gauravkumarverma2001@gmail.com',
    phone: '+917735709660',
    resumeHref: '/Gaurav%20(2%20pages).pdf',
    summary:
      'Full-stack engineer with startup and enterprise experience across microservices, cloud deployments, AI-enabled systems, and production-grade web and mobile features.',
  },
  social: [
    {
      label: 'GitHub',
      href: 'https://github.com/vgauravkumar',
    },
    {
      label: 'LinkedIn',
      href: 'https://linkedin.com/in/vgauravkumar',
    },
    {
      label: 'Email',
      href: 'mailto:gauravkumarverma2001@gmail.com',
    },
  ],
  statusPills: [
    'Open to Software Engineering roles',
    'Microservices + Cloud Infrastructure',
    'AI, ML, and automation focused',
  ],
  stats: [
    {
      value: '4',
      label: 'Professional Roles',
    },
    {
      value: '4',
      label: 'Open-Source Projects',
    },
    {
      value: '8',
      label: 'Honors and Leadership Mentions',
    },
  ],
  highlights: [
    'Designed backend architecture for AI-enabled products using NodeJS, MySQL, and microservices in production environments.',
    'Built reliable distributed systems with RabbitMQ queues, secure API design, AWS deployments, and strong validation and access controls.',
    'Contributed across web and mobile stacks with ReactJS and React Native while maintaining performance, scalability, and clean code standards.',
  ],
  experiences: [
    {
      role: 'Software Engineer',
      company: 'HireQuotient',
      period: 'June 2024 - Sept 2024',
      location: 'Bengaluru, India',
      highlights: [
        'Developed and implemented scalable microservices using Node.js, RabbitMQ for inter-service communication, and MongoDB for data storage.',
        'Applied OOP principles for maintainable backend solutions, deployed services on Amazon EC2, and tailored backend functionality to user requirements.',
        'Used Python for scripting and automation, implemented generative AI techniques to enhance backend processes, and designed message queues for reliable task processing.',
      ],
    },
    {
      role: 'Software Engineer',
      company: 'CareerCarve',
      period: 'Sept 2022 - May 2024',
      location: 'Bengaluru, India',
      highlights: [
        'Designed and developed backend architecture for an AI-enabled resume builder tool and the CareerCarve app using NodeJS and MySQL with multiple microservices and ElasticSearch integrations.',
        'Implemented AWS SES for mailing, AWS S3 for media storage, HTTPS and SSH certificate setup, access-level checks, JOI validations, and user-level logging for analytics and threat prevention.',
        'Deployed backend services on AWS EC2 with auto-scaling and MySQL on RDS and EC2, ensuring high performance and scalability.',
        'Contributed to web and mobile products using ReactJS and React Native, including a feedback and ticket system and deep linking for mobile apps.',
      ],
    },
    {
      role: 'Full Stack Winter Intern',
      company: 'HighRadius Technologies',
      period: 'June 1, 2022 - August 8, 2022',
      location: 'Bhubaneswar, India',
      highlights: [
        'Led development of an AI-enabled fintech B2B cloud application using Jakarta Server, JDBC, Java Servlets, ReactJS, SQLyog, and machine learning.',
        'Evaluated and implemented ML algorithms including Linear Regression, Random Forest, Decision Tree, and XGBoost to deliver strong predictive performance with effective preprocessing.',
        'Spearheaded problem-solving initiatives and delivered bug-free applications on time with strong project ownership and time management.',
      ],
    },
    {
      role: 'Full Stack Summer Intern',
      company: 'HighRadius Technologies',
      period: 'Jan 28, 2022 - April 13, 2022',
      location: 'Bhubaneswar, India',
      highlights: [
        'Developed mini enterprise-level web applications using Ext JS, Spring, and Hibernate with high-quality code and issue resolution.',
        'Collaborated with developers and stakeholders to maintain clear communication and deliver bug-free applications.',
        'Handled complex bug tickets and delivered projects on schedule through structured debugging and solution-oriented execution.',
      ],
    },
  ],
  projects: [
    {
      name: 'BookNabe (Book Exchange App)',
      period: 'Freelance project',
      stack: ['NodeJS', 'ExpressJS', 'Flutter', 'MongoDB', 'Mongoose', 'OAuth', 'Firebase', 'Sockets'],
      summary:
        'Developed a backend and managed deployment for the BookNabe Flutter app to help users exchange books locally.',
      impact:
        'Implemented CRUD operations using NodeJS and MongoDB with Mongoose, and integrated OAuth, Firebase, and socket-based notifications for a richer user experience.',
      links: [],
    },
    {
      name: 'Blockchain Chess Betting Platform',
      period: 'Freelance project',
      stack: ['Solidity', 'Angular', 'NodeJS', 'Heroku', 'Matic'],
      summary:
        'Built a blockchain-based chess betting platform on Matic, enabling users to place secure and transparent wagers on live games.',
      impact:
        'Implemented Solidity smart contracts for betting rules, outcomes, and payouts, and collaborated on front-end and blockchain integration for seamless real-time updates.',
      links: [],
    },
    {
      name: 'Pratijja v16.0 Moderator Bot',
      period: 'Event deployment',
      stack: ['Python', 'Discord API', 'Replit', 'Replit Database', 'Uptime Robot'],
      summary:
        'Developed and deployed a moderator bot for Pratijja v16.0, an international Asian Parliamentary Debate event hosted by KIIT University.',
      impact:
        'Supported 200+ participants across 17 rooms by managing motions, performing CRUD operations, and maintaining 24/7 uptime for uninterrupted event operations.',
      links: [],
    },
    {
      name: 'Discord Cryptocurrency Trading Bot',
      period: 'Production bot deployment',
      stack: ['Python', 'Discord API', 'WazirX API', 'Replit', 'Replit Database', 'Uptime Robot'],
      summary:
        'Built a trading simulation bot for Discord that allowed users to buy and sell cryptocurrencies using virtual money and track portfolio performance.',
      impact:
        'Integrated real-time trading data via WazirX API, maintained separate trading accounts, and designed the system to scale for around 10,000 users with reliable 24/7 uptime.',
      links: [],
    },
  ],
  skills: [
    {
      category: 'Programming Languages',
      items: ['C/C++', 'JavaScript', 'Java', 'Python', 'SQL'],
    },
    {
      category: 'Libraries and Frameworks',
      items: ['NodeJS', 'ExpressJS', 'ReactJS'],
    },
    {
      category: 'Tools and Platforms',
      items: ['GitHub', 'AWS', 'Jenkins', 'Docker'],
    },
    {
      category: 'Databases',
      items: ['MySQL', 'SQLyog', 'MongoDB'],
    },
  ],
  education: [
    {
      institution: 'Kalinga Institute of Industrial Technology, Bhubaneswar',
      degree: 'B.Tech, Computer Science',
      period: 'July 2019 - June 2023',
      notes: 'CGPA: 8.82',
    },
    {
      institution: 'Narayana Junior College, Hyderabad',
      degree: 'Intermediate (PCM)',
      period: 'July 2017 - July 2019',
      notes: 'Score: 82.6',
    },
    {
      institution: "St. Joseph's School, Shaktinagar, UP",
      degree: 'High School',
      period: '2018 - 2019',
      notes: 'CGPA: 8.2',
    },
  ],
  certifications: [
    {
      name: 'International Project Semester',
      issuer: 'CY Cergy Paris University, France',
      year: 'Accepted',
    },
    {
      name: 'Samsung Prism Internship Selection',
      issuer: 'Samsung Prism',
      year: 'Selected',
    },
    {
      name: 'Director of Operations',
      issuer: 'Enactus KISS-KIIT',
      year: 'Leadership Role',
    },
    {
      name: 'President',
      issuer: 'Kronicle Debating Society, KIIT University',
      year: 'Leadership Role',
    },
  ],
  achievements: [
    'Won Special Mention Award at KIIT International eMUN 2021.',
    'Ranked among the top 16 adjudicators worldwide at The Contemplative Dialogue Debate Tournament 2020.',
    'Led development of Project Vetra, winner of The Most Voted Project Video at Enactus India National Competition (2021).',
    "Runner-up in ZS Associates' Campus Beats Pan-India Case Challenge.",
    'Accepted into the International Project Semester at CY Cergy Paris University, France.',
    'Selected for Samsung Prism project internship.',
    'Served as Director of Operations at Enactus KISS-KIIT.',
    'Served as Coordinator at Kronicle Debating Society, KIIT University.',
  ],
};
