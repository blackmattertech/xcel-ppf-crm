import Layout from '@/components/Layout'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Layout>
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Marketing</h1>
        {children}
      </div>
    </Layout>
  )
}
