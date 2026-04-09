'use client'

/**
 * User Data Deletion Instructions
 * Required by Meta (Facebook/WhatsApp) App Review.
 * This page must be publicly accessible and explain how users can request deletion of their data.
 */

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="bg-white shadow rounded-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            User Data Deletion Instructions
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Ultrakool CRM — Last updated: February 2025
          </p>

          <section className="prose prose-gray max-w-none">
            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">
              How to request deletion of your data
            </h2>
            <p className="text-gray-700 mb-4">
              If you have used our services (including WhatsApp messaging via Ultrakool CRM) and want to
              request deletion of your personal data that we hold, you can do so in the following
              ways:
            </p>

            <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-6">
              <li>
                <strong>Email:</strong> Send a data deletion request to{' '}
                <a
                  href="mailto:info@ultrakool.com"
                  className="text-blue-600 hover:underline"
                >
                  info@ultrakool.com
                </a>{' '}
                with the subject line &quot;Data Deletion Request&quot;. Please include the phone
                number and/or email address associated with your account so we can identify your
                data.
              </li>
              <li>
                <strong>Contact form:</strong> You may also submit a request through our main
                website at{' '}
                <a
                  href="https://ultrakool.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  https://ultrakool.com
                </a>{' '}
                and specify that you are requesting deletion of your personal data.
              </li>
            </ol>

            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">
              What we do after your request
            </h2>
            <p className="text-gray-700 mb-4">
              We will process your request within 30 days. We will delete or anonymize the personal
              data we hold about you that is associated with our CRM and messaging services, except
              where we are required or permitted to retain it by law (for example for tax or
              legal compliance). You will receive a confirmation once the deletion has been
              completed.
            </p>

            <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">
              Data we may hold
            </h2>
            <p className="text-gray-700 mb-4">
              Depending on your interaction with us, we may hold your name, phone number, email
              address, and conversation or lead history in our CRM and related systems. This data
              is used to provide our services (e.g. PPF, ceramic coating, car care) and
              communications. Upon your request, we will remove or anonymize this data as
              described above.
            </p>

            <p className="text-gray-600 text-sm mt-8">
              For more information about how we collect and use data, please see our{' '}
              <a
                href="https://ultrakool.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
