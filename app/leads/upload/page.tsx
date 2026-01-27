'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { Upload, Download, FileText, CheckCircle, XCircle, AlertCircle, ArrowLeft, X } from 'lucide-react'
import Papa from 'papaparse'
import Link from 'next/link'

interface ParsedLead {
  [key: string]: any
}

interface ValidationError {
  row: number
  field: string
  message: string
}

export default function UploadLeadsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedLead[]>([])
  const [allData, setAllData] = useState<ParsedLead[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload')

  // Required fields for leads
  const requiredFields = ['name', 'phone', 'source']
  const optionalFields = [
    'email',
    'requirement',
    'interest_level',
    'budget_range',
    'timeline',
    'campaign_id',
    'ad_id',
    'adset_id',
    'form_id',
    'form_name',
    'ad_name',
    'campaign_name',
    'platform',
    'status',
  ]

  // Example template data
  const templateData = [
    {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john.doe@example.com',
      source: 'meta',
      requirement: 'paint_protection_film',
      interest_level: 'hot',
      budget_range: '$5000-$10000',
      timeline: '1-2 weeks',
      campaign_id: 'CAM123',
      ad_id: 'AD456',
      adset_id: 'ADS789',
      form_id: 'FORM001',
      form_name: 'Contact Form',
      ad_name: 'Summer Sale',
      campaign_name: 'Q2 Campaign',
      platform: 'ig',
      status: 'new',
    },
  ]

  // Download template CSV
  const downloadTemplate = () => {
    const csv = Papa.unparse(templateData, {
      header: true,
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'leads_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Validate lead data
  const validateLead = (lead: ParsedLead, index: number): ValidationError[] => {
    const errors: ValidationError[] = []

    // Check required fields
    if (!lead.name || lead.name.trim() === '') {
      errors.push({ row: index + 2, field: 'name', message: 'Name is required' })
    }
    if (!lead.phone || lead.phone.trim() === '') {
      errors.push({ row: index + 2, field: 'phone', message: 'Phone is required' })
    }
    if (!lead.source || lead.source.trim() === '') {
      errors.push({ row: index + 2, field: 'source', message: 'Source is required' })
    } else {
      const validSources = ['meta', 'manual', 'form', 'whatsapp', 'ivr']
      if (!validSources.includes(lead.source.toLowerCase())) {
        errors.push({
          row: index + 2,
          field: 'source',
          message: `Source must be one of: ${validSources.join(', ')}`,
        })
      }
    }

    // Validate email format if provided
    if (lead.email && lead.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(lead.email)) {
        errors.push({ row: index + 2, field: 'email', message: 'Invalid email format' })
      }
    }

    // Validate interest_level if provided
    if (lead.interest_level && lead.interest_level.trim() !== '') {
      const validLevels = ['hot', 'warm', 'cold']
      if (!validLevels.includes(lead.interest_level.toLowerCase())) {
        errors.push({
          row: index + 2,
          field: 'interest_level',
          message: `Interest level must be one of: ${validLevels.join(', ')}`,
        })
      }
    }

    // Validate status if provided
    if (lead.status && lead.status.trim() !== '') {
      const validStatuses = [
        'new',
        'qualified',
        'unqualified',
        'quotation_shared',
        'quotation_viewed',
        'quotation_accepted',
        'quotation_expired',
        'interested',
        'negotiation',
        'lost',
        'converted',
        'deal_won',
        'payment_pending',
        'advance_received',
        'fully_paid',
      ]
      if (!validStatuses.includes(lead.status.toLowerCase())) {
        errors.push({
          row: index + 2,
          field: 'status',
          message: 'Invalid status value',
        })
      }
    }

    return errors
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setValidationErrors([])
    setUploadResults(null)
    setStep('upload')

    try {
      const text = await selectedFile.text()
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as ParsedLead[]
          setAllData(data)
          setPreview(data.slice(0, 10)) // Show first 10 rows

          // Validate all rows
          const errors: ValidationError[] = []
          data.forEach((lead, index) => {
            const rowErrors = validateLead(lead, index)
            errors.push(...rowErrors)
          })
          setValidationErrors(errors)

          if (errors.length === 0) {
            setStep('preview')
          }
        },
        error: (error: any) => {
          alert(`Error parsing CSV: ${error.message}`)
        },
      })
    } catch (error) {
      alert('Error reading file. Please ensure it is a valid CSV file.')
    }
  }

  // Handle file upload
  const handleUpload = async () => {
    if (allData.length === 0) return

    setUploading(true)
    setUploadResults(null)

    try {
      // Prepare data for upload
      const leadsToUpload = allData.map((lead) => {
        const metaData: Record<string, any> = {}
        if (lead.platform) metaData.platform = lead.platform

        return {
          name: lead.name?.trim() || '',
          phone: lead.phone?.trim() || '',
          email: lead.email?.trim() || null,
          source: (lead.source?.trim() || 'manual').toLowerCase(),
          requirement: lead.requirement?.trim() || null,
          campaign_id: lead.campaign_id?.trim() || null,
          ad_id: lead.ad_id?.trim() || null,
          adset_id: lead.adset_id?.trim() || null,
          form_id: lead.form_id?.trim() || null,
          form_name: lead.form_name?.trim() || null,
          ad_name: lead.ad_name?.trim() || null,
          campaign_name: lead.campaign_name?.trim() || null,
          meta_data: Object.keys(metaData).length > 0 ? metaData : null,
        }
      })

      const response = await fetch('/api/leads/bulk-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leads: leadsToUpload }),
      })

      const result = await response.json()

      if (response.ok) {
        const successCount = result.results?.success?.length || result.success || 0
        const failedCount = result.results?.failed?.length || result.failed || 0
        const errors = result.results?.failed?.map((f: any) => `Row ${f.row}: ${f.error}`) || []
        
        setUploadResults({
          success: successCount,
          failed: failedCount,
          errors: errors,
        })
        setStep('results')
      } else {
        alert(result.error || 'Failed to upload leads')
      }
    } catch (error) {
      alert('Error uploading leads. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // Reset and start over
  const handleReset = () => {
    setFile(null)
    setPreview([])
    setAllData([])
    setValidationErrors([])
    setUploadResults(null)
    setStep('upload')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/leads"
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Import Leads</h1>
              <p className="text-gray-600 mt-1">Upload a CSV file to import leads into the system</p>
            </div>
          </div>
        </div>

        {/* Template Download Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Need a template?</h3>
              <p className="text-blue-700 text-sm mb-3">
                Download our CSV template with example data to ensure your file is formatted correctly.
              </p>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Download size={18} />
                Download Template
              </button>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        {step === 'upload' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Upload size={32} className="text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload CSV File</h2>
              <p className="text-gray-600 mb-6">
                Select a CSV file containing lead information. The file will be validated before upload.
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-[#ed1b24] transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <FileText size={48} className="text-gray-400 mb-4" />
                  <span className="text-[#ed1b24] font-medium mb-2">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-sm text-gray-500">CSV files only</span>
                </label>
              </div>

              {file && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                  <FileText size={16} />
                  <span>{file.name}</span>
                  <button
                    onClick={handleReset}
                    className="ml-2 text-red-600 hover:text-red-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={20} className="text-red-600" />
                    <h3 className="font-semibold text-red-900">
                      Validation Errors ({validationErrors.length})
                    </h3>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <ul className="space-y-1 text-sm text-red-700">
                      {validationErrors.slice(0, 20).map((error, index) => (
                        <li key={index}>
                          Row {error.row}, {error.field}: {error.message}
                        </li>
                      ))}
                      {validationErrors.length > 20 && (
                        <li className="text-red-600 font-medium">
                          ... and {validationErrors.length - 20} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                  <p className="mt-3 text-sm text-red-700">
                    Please fix the errors in your CSV file before uploading.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preview Section */}
        {step === 'preview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Preview Data</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Review your data before uploading. Showing first 10 rows of {allData.length} total rows.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Upload Different File
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(preview[0] || {}).map((key) => (
                        <th
                          key={key}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {preview.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        {Object.values(row).map((value: any, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                          >
                            {String(value || '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  <CheckCircle size={16} className="inline mr-2 text-green-600" />
                  All {allData.length} rows validated successfully
                </div>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-6 py-2 bg-[#ed1b24] text-white rounded-md hover:bg-[#d11820] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Upload {allData.length} Leads
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {step === 'results' && uploadResults && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              {uploadResults.failed === 0 ? (
                <div className="mb-6">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} className="text-green-600" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Upload Successful!
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Successfully uploaded {uploadResults.success} lead(s).
                  </p>
                </div>
              ) : (
                <div className="mb-6">
                  <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle size={32} className="text-yellow-600" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Upload Completed with Errors
                  </h2>
                  <p className="text-gray-600 mb-2">
                    Successfully uploaded {uploadResults.success} lead(s).
                  </p>
                  <p className="text-gray-600 mb-4">
                    Failed to upload {uploadResults.failed} lead(s).
                  </p>
                  {uploadResults.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left max-h-60 overflow-y-auto">
                      <ul className="space-y-1 text-sm text-red-700">
                        {uploadResults.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleReset}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Upload Another File
                </button>
                <Link
                  href="/leads"
                  className="px-6 py-2 bg-[#ed1b24] text-white rounded-md hover:bg-[#d11820]"
                >
                  View Leads
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
