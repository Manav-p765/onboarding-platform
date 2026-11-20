// Form templates. Shared by server and client code (no secrets here).
// To add a new service form: add a template to FORMS and its key to SERVICE_KEYS.

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "select"
  | "checkboxes"
  | "colors"
  | "repeater"
  | "file";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: string[];
  /** repeater only */
  columns?: { key: string; label: string; placeholder?: string }[];
  maxRows?: number;
  /** file only */
  multiple?: boolean;
  accept?: string;
};

export type Section = { key: string; title: string; description?: string; fields: Field[] };
export type FormTemplate = { key: string; title: string; short: string; description: string; sections: Section[] };

export const PROFILE: FormTemplate = {
  key: "profile",
  title: "Company Profile",
  short: "Company",
  description: "The basics about your business. You fill this once, and we use it for every service.",
  sections: [
    {
      key: "contact",
      title: "Company & contact",
      fields: [
        { key: "company", label: "Company name", type: "text", required: true },
        { key: "contact_name", label: "Main contact person", type: "text", required: true },
        { key: "phone", label: "Phone number", type: "tel", required: true },
        { key: "email", label: "Email address", type: "email", required: true },
        { key: "website", label: "Current website", type: "url", placeholder: "www.example.com" },
        { key: "address", label: "Business address", type: "textarea" },
        { key: "extra_locations", label: "Other locations (if any)", type: "textarea" },
      ],
    },
    {
      key: "market",
      title: "Your market",
      fields: [
        {
          key: "target_audience",
          label: "Who are your ideal customers?",
          type: "textarea",
          help: "Industries, types of buildings or businesses, areas you serve.",
        },
        { key: "service_areas", label: "Cities / areas you serve", type: "textarea" },
        {
          key: "competitors",
          label: "Top 3 competitors",
          type: "repeater",
          maxRows: 3,
          columns: [
            { key: "name", label: "Company" },
            { key: "url", label: "Website", placeholder: "www…" },
          ],
        },
        {
          key: "services_offered",
          label: "Services you offer",
          type: "repeater",
          maxRows: 30,
          columns: [
            { key: "name", label: "Service", placeholder: "e.g. Armed guards" },
            { key: "description", label: "Short description (optional)" },
          ],
        },
      ],
    },
    {
      key: "brand",
      title: "Brand & assets",
      description: "Upload what you have. Anything missing can be sent later.",
      fields: [
        { key: "logo", label: "Logo (best quality you have)", type: "file", multiple: true, accept: "image/*,.ai,.eps,.pdf,.svg" },
        {
          key: "logo_status",
          label: "About your logo",
          type: "select",
          options: ["Logo is good as is", "Logo needs improvement", "We don't have a logo yet"],
        },
        { key: "brand_colors", label: "Brand colors", type: "colors", help: "Pick your colors, or describe them in the notes." },
        { key: "brand_notes", label: "Brand notes", type: "textarea", placeholder: "e.g. bright, inviting blue, white and gold, a little red" },
        { key: "brand_guidelines", label: "Brand guidelines (if any)", type: "file", multiple: true },
        { key: "media", label: "Photos & videos of your team / work", type: "file", multiple: true, accept: "image/*,video/*" },
        {
          key: "media_link",
          label: "Or share a folder link",
          type: "url",
          help: "Google Drive / Dropbox link. Best for large videos.",
        },
      ],
    },
  ],
};

export const WEBSITE: FormTemplate = {
  key: "website",
  title: "Website",
  short: "Website",
  description: "What your new website needs to do.",
  sections: [
    {
      key: "goals",
      title: "Goals",
      fields: [
        {
          key: "goals",
          label: "What should the website achieve?",
          type: "checkboxes",
          options: ["More calls & leads", "Look more professional", "Rank higher on Google", "Recruit new staff", "Show our work / portfolio"],
        },
        { key: "goals_notes", label: "Anything else?", type: "textarea" },
        { key: "sites_you_like", label: "Websites you like (and why)", type: "textarea" },
      ],
    },
    {
      key: "pages",
      title: "Pages",
      fields: [
        {
          key: "pages",
          label: "Pages you want",
          type: "checkboxes",
          options: ["Home", "About", "Services", "Service areas", "Careers / Apply", "Testimonials", "FAQ", "Blog", "Contact"],
        },
        { key: "extra_pages", label: "Other pages", type: "textarea" },
        { key: "about_text", label: "Tell us your story", type: "textarea", help: "History, experience, licenses, what makes you different. Rough notes are fine." },
        { key: "testimonials", label: "Customer reviews / testimonials", type: "textarea" },
        { key: "content_files", label: "Any documents with content", type: "file", multiple: true },
      ],
    },
    {
      key: "leads",
      title: "Leads & forms",
      fields: [
        { key: "lead_email", label: "Which email should website leads go to?", type: "email", required: true },
        { key: "crm", label: "Do you use a CRM?", type: "select", options: ["No", "GoHighLevel", "HubSpot", "Salesforce", "Other"] },
        { key: "crm_notes", label: "CRM details", type: "textarea" },
        { key: "careers", label: "Employment / job application needs", type: "textarea", placeholder: "e.g. online application form, resume upload" },
      ],
    },
  ],
};

export const SEO: FormTemplate = {
  key: "seo",
  title: "SEO & GEO",
  short: "SEO",
  description: "Help us get you found on Google and AI search.",
  sections: [
    {
      key: "seo",
      title: "Search goals",
      fields: [
        { key: "priority_services", label: "Which services matter most to you?", type: "textarea" },
        { key: "priority_areas", label: "Which cities / areas matter most?", type: "textarea" },
        { key: "keywords", label: "What would customers type into Google to find you?", type: "textarea" },
        {
          key: "gbp",
          label: "Do you have a Google Business Profile?",
          type: "select",
          options: ["Yes", "No", "Not sure"],
        },
        { key: "past_seo", label: "Any past SEO work or marketing we should know about?", type: "textarea" },
      ],
    },
  ],
};

export const SOCIAL: FormTemplate = {
  key: "social",
  title: "Social Media",
  short: "Social",
  description: "How you want to show up on social media.",
  sections: [
    {
      key: "accounts",
      title: "Your accounts",
      fields: [
        {
          key: "platforms",
          label: "Which platforms should we manage?",
          type: "checkboxes",
          options: ["Facebook", "Instagram", "LinkedIn", "YouTube", "TikTok", "X (Twitter)", "Not sure, advise us"],
        },
        {
          key: "existing",
          label: "Do you already have these accounts?",
          type: "select",
          options: ["Yes, all of them", "Some of them", "No, please create them"],
        },
        { key: "profile_links", label: "Links to your current pages (if any)", type: "textarea", placeholder: "facebook.com/…, instagram.com/…" },
      ],
    },
    {
      key: "content",
      title: "Content",
      fields: [
        {
          key: "goals",
          label: "What should social media do for you?",
          type: "checkboxes",
          options: ["Win new clients", "Recruit officers / staff", "Build trust & reputation", "Show our team at work", "Share safety tips"],
        },
        {
          key: "tone",
          label: "How should posts sound?",
          type: "select",
          options: ["Professional & formal", "Friendly & approachable", "Bold & confident"],
        },
        { key: "topics_avoid", label: "Anything we should never post about?", type: "textarea", placeholder: "e.g. client names, site locations" },
        { key: "photo_permission", label: "Can we post photos of your staff and sites?", type: "select", options: ["Yes", "Staff only, no client sites", "No, use stock photos"] },
        { key: "social_media", label: "Photos & videos for posts", type: "file", multiple: true, accept: "image/*,video/*" },
      ],
    },
  ],
};

export const GBP: FormTemplate = {
  key: "gbp",
  title: "Google Business Profile",
  short: "GBP",
  description: "Details for your listing on Google Search and Maps.",
  sections: [
    {
      key: "listing",
      title: "Your listing",
      fields: [
        { key: "has_profile", label: "Do you already have a Google Business Profile?", type: "select", options: ["Yes", "No", "Not sure"] },
        { key: "profile_link", label: "Link to it (if you have one)", type: "url", placeholder: "Search your business on Google Maps, then Share → Copy link" },
        {
          key: "address_display",
          label: "Should customers see your address?",
          type: "select",
          options: ["Yes, customers can visit us", "No, we go to customers (service-area business)"],
        },
        { key: "hours", label: "Business hours", type: "textarea", placeholder: "e.g. Mon–Fri 9–5, security services 24/7" },
        { key: "gbp_areas", label: "Service areas to show on Google", type: "textarea", placeholder: "Cities, counties or ZIP codes" },
      ],
    },
    {
      key: "details",
      title: "Details & photos",
      fields: [
        { key: "licenses", label: "Licenses & certifications", type: "textarea", placeholder: "e.g. NYS DCJS licensed, insured, veteran-owned" },
        { key: "year_founded", label: "Year founded", type: "text" },
        { key: "gbp_photos", label: "Photos (office, team, vehicles, uniforms)", type: "file", multiple: true, accept: "image/*" },
      ],
    },
  ],
};

export const FORMS: Record<string, FormTemplate> = { profile: PROFILE, website: WEBSITE, seo: SEO, social: SOCIAL, gbp: GBP };
/** Services the admin can pick. Profile is always included. */
export const SERVICE_KEYS = ["website", "seo", "social", "gbp"] as const;

export const DEFAULT_PLATFORMS = [
  "Website hosting",
  "Domain registrar",
  "WordPress admin",
  "Google account (Analytics / Search Console)",
  "Google Business Profile",
  "Facebook",
  "Instagram",
  "LinkedIn",
];

export function formsForClient(services: string[]): FormTemplate[] {
  return [PROFILE, ...services.map((s) => FORMS[s]).filter(Boolean)];
}

export type AnswerMap = Record<string, Record<string, unknown>>; // form -> field -> value

export function isFilled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some((x) => (typeof x === "object" && x ? Object.values(x).some((y) => String(y ?? "").trim()) : isFilled(x)));
  return true;
}

/** Fields counted toward % complete. */
export function allFields(forms: FormTemplate[]) {
  return forms.flatMap((f) => f.sections.flatMap((s) => s.fields.map((field) => ({ form: f.key, field }))));
}
