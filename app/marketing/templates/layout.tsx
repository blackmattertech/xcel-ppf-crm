import { marketingWhatsAppUiNotFound } from '@/lib/marketing-ui-hidden'

export default function MarketingTemplatesLayout({ children }: { children: React.ReactNode }) {
  void children
  marketingWhatsAppUiNotFound()
}
