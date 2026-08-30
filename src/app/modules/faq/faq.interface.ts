export interface IFaq {
  question: string;
  answer: string;
  role: 'user' | 'snapper';
  isActive?: boolean;
}
