export interface CharacterProfile {
  name?: string;
  age?: number;
  gender?: string;
  occupation?: string;
  monthlyIncome?: number;
  monthlyPayment?: number;
  totalInstallments?: number;
  paidInstallments?: number;
  customerSituation?: string;
  debtAmount?: number;
  debtDays?: number;
  debtReason?: string;
  familyStatus?: string;
  catchphrases?: string;
  closingPrompt?: string;
  ttsConfig?: {
    providerId?: string;
    voice?: string;
    baseUrl?: string;
    apiKey?: string;
  };
}

export interface CharacterDimension {
  id: string;
  label: string;
  description: string;
  content: string;
  order: number;
  enabled: boolean;
}

export interface AiCharacterTemplate {
  id: string;
  name: string;
  description?: string;
  personalityType?: string;
  profile: CharacterProfile;
  dimensions: CharacterDimension[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}
