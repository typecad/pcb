export interface SkillParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface SkillExample {
  title: string;
  code: string;
}

export interface Skill {
  name: string;
  category: string;
  description: string;
  package?: string;
  import?: string;
  usage?: {
    signature: string;
    parameters: SkillParameter[];
  };
  examples: SkillExample[];
  notes: string[];
  related: string[];
}

export interface SkillSummary {
  name: string;
  category: string;
  description: string;
}
