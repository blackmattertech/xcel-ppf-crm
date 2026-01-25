'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'

interface ParsedLead {
  [key: string]: any
}

export default function UploadLeadsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedLead[]>([])
  const [allData, setAllData] = useState<ParsedLead[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadResults, setUploadResults] = useState<any>(null)

  // Field mapping from uploaded format to database
  const fieldMappings: Record<string, string> = {
    'id': 'lead_id',
    'created_time': 'created_at',
    'ad_id': 'ad_id',
    'ad_name': 'ad_name',
    'adset_id': 'adset_id',
    'adset_name': 'adset_name',
    'campaign_id': 'campaign_id',
    'campaign_name': 'campaign_name',
    'form_id': 'form_id',
    'form_name': 'form_name',
    'is_organic': 'is_organic',
    'platform': 'platform',
    'what_services_are_you_looking_for?': 'requirement',
    'car_model': 'car_model',
    'full_name': 'name',
    'phone_number': 'phone',
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError('')
    setSuccess('')
    setPreview([])
    setAllData([])
    setUploadResults(null)
    setLoading(true)

    try {
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase()
      let parsedData: ParsedLead[] = []

      if (fileExtension === 'csv') {
        // Parse CSV - handle UTF-16 encoding issues
        const arrayBuffer = await selectedFile.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        
        // Detect encoding and convert to UTF-8 string
        let text: string
        // Check for UTF-16 BOM
        if (uint8Array.length >= 2) {
          // UTF-16 LE BOM: FF FE
          if (uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
            // UTF-16 Little Endian
            const uint16Array = new Uint16Array(arrayBuffer.slice(2))
            text = String.fromCharCode(...uint16Array)
          }
          // UTF-16 BE BOM: FE FF
          else if (uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
            // UTF-16 Big Endian - need to swap bytes
            const uint16Array = new Uint16Array(arrayBuffer.slice(2))
            text = String.fromCharCode(...Array.from(uint16Array).map(val => ((val & 0xFF) << 8) | ((val & 0xFF00) >> 8)))
          }
          // UTF-8 BOM: EF BB BF
          else if (uint8Array[0] === 0xEF && uint8Array[1] === 0xBB && uint8Array[2] === 0xBF) {
            text = new TextDecoder('utf-8').decode(uint8Array.slice(3))
          }
          else {
            // Try UTF-8 first, fallback to UTF-16 if it looks like UTF-16
            try {
              text = new TextDecoder('utf-8', { fatal: true }).decode(uint8Array)
            } catch {
              // If UTF-8 fails, try UTF-16 LE (most common)
              const uint16Array = new Uint16Array(arrayBuffer)
              text = String.fromCharCode(...uint16Array)
            }
          }
        } else {
          text = new TextDecoder('utf-8').decode(uint8Array)
        }
        
        // Remove BOM if still present
        text = text.replace(/^\uFEFF/, '')
        
        // Clean function to remove null bytes and fix encoding issues
        const cleanValue = (val: any): string => {
          if (val === null || val === undefined) return ''
          let str = String(val)
          // Remove null bytes (UTF-16 encoding artifact)
          str = str.replace(/\u0000/g, '')
          // Remove other control characters except newlines and tabs
          str = str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
          return str.trim()
        }
        
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header: string) => {
            // Remove BOM and trim whitespace from header names
            return cleanValue(header)
          },
          complete: (results: Papa.ParseResult<ParsedLead>) => {
            // Clean up the data - remove BOM from column names and clean values
            const cleanColumnName = (col: string): string => {
              if (!col) return ''
              let cleaned = cleanValue(col)
              // Remove invisible Unicode characters
              cleaned = cleaned.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
              return cleaned
            }
            
            parsedData = (results.data as ParsedLead[]).map(row => {
              const cleanedRow: ParsedLead = {}
              Object.keys(row).forEach(key => {
                const cleanedKey = cleanColumnName(key)
                const value = row[key]
                cleanedRow[cleanedKey] = cleanValue(value)
              })
              return cleanedRow
            })
            setAllData(parsedData) // Store all data
            setPreview(parsedData.slice(0, 5)) // Show first 5 rows as preview
            autoMapFields(parsedData[0] || {})
            setLoading(false)
          },
          error: (error: Error) => {
            setError(`Failed to parse CSV: ${error.message}`)
            setLoading(false)
          },
        })
      } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
        // Parse Excel
        const arrayBuffer = await selectedFile.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
        
        // Clean function to remove null bytes and fix encoding issues
        const cleanValue = (val: any): string => {
          if (val === null || val === undefined) return ''
          let str = String(val)
          // Remove null bytes (UTF-16 encoding artifact)
          str = str.replace(/\u0000/g, '')
          // Remove other control characters except newlines and tabs
          str = str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
          // Remove quotes if they wrap the entire string
          str = str.replace(/^["']|["']$/g, '')
          return str.trim()
        }
        
        // Clean up column names - remove BOM and trim
        const cleanColumnName = (col: string): string => {
          if (!col) return ''
          let cleaned = cleanValue(col)
          // Remove invisible Unicode characters
          cleaned = cleaned.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
          return cleaned
        }
        
        parsedData = (jsonData as ParsedLead[]).map(row => {
          const cleanedRow: ParsedLead = {}
          Object.keys(row).forEach(key => {
            const cleanedKey = cleanColumnName(key)
            const value = row[key]
            cleanedRow[cleanedKey] = cleanValue(value)
          })
          return cleanedRow
        })
        setAllData(parsedData) // Store all data
        setPreview(parsedData.slice(0, 5)) // Show first 5 rows as preview
        autoMapFields(parsedData[0] || {})
        setLoading(false)
      } else {
        setError('Unsupported file format. Please upload CSV, XLS, or XLSX files.')
        setLoading(false)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
      setLoading(false)
    }
  }

  const autoMapFields = (firstRow: ParsedLead) => {
    const autoMapping: Record<string, string> = {}
    const uploadedFields = Object.keys(firstRow)

    // Auto-map fields based on field mappings
    for (const [uploadField, dbField] of Object.entries(fieldMappings)) {
      const matchingField = uploadedFields.find(
        (f) => f.toLowerCase().replace(/[_\s]/g, '') === uploadField.toLowerCase().replace(/[_\s?]/g, '')
      )
      if (matchingField) {
        autoMapping[matchingField] = dbField
      }
    }

    // Also try direct matches
    uploadedFields.forEach((field) => {
      if (fieldMappings[field]) {
        autoMapping[field] = fieldMappings[field]
      }
    })

    setMapping(autoMapping)
  }

  const transformLeads = (data: ParsedLead[]): any[] => {
    if (data.length === 0) return []

    // Get all actual column names from the first row (case-insensitive matching)
    // Clean column names - remove BOM and trim
    const rawColumns = Object.keys(data[0] || {})
    const actualColumns = rawColumns.map(col => {
      // Remove BOM and other invisible characters, trim whitespace
      return col.replace(/^\uFEFF/, '').replace(/^[\u200B-\u200D\uFEFF]/, '').trim()
    })
    const columnMap = new Map<string, string>() // normalized -> actual
    
    actualColumns.forEach(col => {
      const normalized = col.toLowerCase().replace(/[_\s-]/g, '')
      if (!columnMap.has(normalized)) {
        columnMap.set(normalized, col)
      }
    })

    return data.map((row, index) => {
      const transformed: any = {
        source: 'manual', // Default source
        meta_data: {},
      }

      // Get all possible field name variations with case-insensitive matching
      const getFieldValue = (possibleNames: string[]): string | null => {
        // Get all actual keys from the row (they might have BOM)
        const rowKeys = Object.keys(row)
        
        // First try exact matches
        for (const name of possibleNames) {
          // Try exact match
          if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            const value = String(row[name]).trim()
            if (value) return value
          }
        }
        
        // Then try matching against actual row keys (handling BOM and case variations)
        for (const name of possibleNames) {
          const nameLower = name.toLowerCase().replace(/[_\s-?]/g, '')
          
          // Find matching key in row
          for (const rowKey of rowKeys) {
            const rowKeyCleaned = rowKey.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '').trim()
            const rowKeyNormalized = rowKeyCleaned.toLowerCase().replace(/[_\s-?]/g, '')
            
            if (rowKeyNormalized === nameLower || 
                rowKeyNormalized.includes(nameLower) || 
                nameLower.includes(rowKeyNormalized)) {
              const value = row[rowKey]
              if (value !== undefined && value !== null && value !== '') {
                const strValue = String(value).trim()
                if (strValue) return strValue
              }
            }
          }
        }
        
        // Also try using the column map
        for (const name of possibleNames) {
          const normalized = name.toLowerCase().replace(/[_\s-]/g, '')
          const actualCol = columnMap.get(normalized)
          if (actualCol) {
            // Try all variations of the column name
            for (const rowKey of rowKeys) {
              const rowKeyCleaned = rowKey.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '').trim()
              if (rowKeyCleaned === actualCol || rowKey === actualCol) {
                const value = row[rowKey]
                if (value !== undefined && value !== null && value !== '') {
                  const strValue = String(value).trim()
                  if (strValue) return strValue
                }
              }
            }
          }
        }
        
        return null
      }

      // Map fields with multiple possible names (including exact matches from CSV)
      const name = getFieldValue([
        'full_name', 'Full Name', 'full name', 'Full_Name', 'FULL_NAME',
        'name', 'Name', 'NAME', 'fullname', 'FullName'
      ])
      let phone = getFieldValue([
        'phone_number', 'Phone Number', 'phone number', 'Phone_Number', 'PHONE_NUMBER',
        'phone', 'Phone', 'PHONE', 'phonenumber', 'PhoneNumber',
        'mobile', 'Mobile', 'MOBILE', 'contact', 'Contact'
      ])
      
      // Clean phone number - remove "p:" prefix if present
      if (phone) {
        phone = phone.replace(/^p:/i, '').trim()
      }
      const email = getFieldValue(['email', 'Email', 'EMAIL', 'email_address'])
      const requirement = getFieldValue(['what_services_are_you_looking_for?', 'what_services_are_you_looking_for', 'requirement', 'Requirement'])
      
      // Campaign fields
      const adId = getFieldValue(['ad_id', 'Ad ID', 'ad id'])
      const adName = getFieldValue(['ad_name', 'Ad Name', 'ad name'])
      const adsetId = getFieldValue(['adset_id', 'Adset ID', 'adset id'])
      const adsetName = getFieldValue(['adset_name', 'Adset Name', 'adset name'])
      const campaignId = getFieldValue(['campaign_id', 'Campaign ID', 'campaign id'])
      const campaignName = getFieldValue(['campaign_name', 'Campaign Name', 'campaign name'])
      const formId = getFieldValue(['form_id', 'Form ID', 'form id'])
      const formName = getFieldValue(['form_name', 'Form Name', 'form name'])
      
      // Platform and other fields
      const platform = getFieldValue(['platform', 'Platform', 'PLATFORM'])
      const isOrganic = getFieldValue(['is_organic', 'Is Organic', 'is organic'])
      const carModel = getFieldValue(['car_model', 'Car Model', 'car model'])
      const leadId = getFieldValue(['id', 'ID', 'Id', 'lead_id', 'Lead ID'])

      // Set required fields
      if (name) transformed.name = name
      if (phone) {
        // Clean phone number - remove "p:" prefix and any other prefixes
        let cleanedPhone = phone.replace(/^p:/i, '').trim()
        // Also remove other common prefixes like "tel:", "phone:", etc.
        cleanedPhone = cleanedPhone.replace(/^(tel|phone|mobile):/i, '').trim()
        transformed.phone = cleanedPhone
      }
      if (email) transformed.email = email
      if (requirement) transformed.requirement = requirement
      if (leadId) transformed.lead_id = leadId

      // Set campaign fields
      if (adId) transformed.ad_id = adId
      if (adName) transformed.ad_name = adName
      if (adsetId) transformed.adset_id = adsetId
      if (campaignId) transformed.campaign_id = campaignId
      if (campaignName) transformed.campaign_name = campaignName
      if (formId) transformed.form_id = formId
      if (formName) transformed.form_name = formName

      // Determine source
      if (platform) {
        const platformLower = platform.toLowerCase()
        if (platformLower.includes('meta') || platformLower.includes('facebook') || platformLower.includes('instagram')) {
          transformed.source = 'meta'
        }
      }

      // Store additional fields in meta_data
      if (adsetName) transformed.meta_data.adset_name = adsetName
      if (isOrganic) transformed.meta_data.is_organic = isOrganic
      if (carModel) transformed.meta_data.car_model = carModel
      if (platform) transformed.meta_data.platform = platform

      // Store created_time if available
      const createdTime = getFieldValue(['created_time', 'Created Time', 'created time', 'created_at', 'Created At'])
      if (createdTime) {
        try {
          transformed.meta_data.created_time = createdTime
        } catch {
          // Ignore
        }
      }

      // Store any other fields that weren't mapped
      Object.keys(row).forEach((key) => {
        const value = row[key]
        if (value !== undefined && value !== null && value !== '') {
          const keyLower = key.toLowerCase().replace(/[_\s?]/g, '')
          const mappedKeys = [
            'fullname', 'phonenumber', 'email', 'requirement', 'id', 'leadid',
            'adid', 'adname', 'adsetid', 'adsetname', 'campaignid', 'campaignname',
            'formid', 'formname', 'platform', 'isorganic', 'carmodel', 'createdtime'
          ]
          if (!mappedKeys.includes(keyLower)) {
            transformed.meta_data[key] = value
          }
        }
      })

      return transformed
    })
  }

  const handleUpload = async () => {
    if (!file || allData.length === 0) {
      setError('Please select a file first')
      return
    }

    // Check authentication
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      // Use the already parsed data
      const parsedData = allData

      if (parsedData.length === 0) {
        setError('No data found in the file. Please check the file format.')
        setUploading(false)
        return
      }

      // Check if required columns exist (case-insensitive)
      // The data should already be cleaned, but let's clean again to be sure
      const firstRow = parsedData[0]
      const rawColumns = Object.keys(firstRow)
      
      // More aggressive cleaning function - remove all invisible characters
      const cleanColumnName = (col: string): string => {
        if (!col) return ''
        // Remove BOM and other invisible Unicode characters
        let cleaned = col
          .replace(/^\uFEFF/, '') // UTF-8 BOM
          .replace(/[\uFEFF\u200B-\u200D\u2060\uFEFF]/g, '') // Remove all invisible chars
          .replace(/^[\u200B-\u200D\uFEFF]/, '') // Zero-width characters at start
          .trim()
        // Also remove any non-printable characters
        cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        return cleaned
      }
      
      const columns = rawColumns.map(cleanColumnName)
      // Normalize: lowercase, remove underscores, spaces, hyphens, and question marks
      const normalizedColumns = columns.map(c => {
        const normalized = c.toLowerCase().replace(/[_\s\-?]/g, '')
        // Also remove any remaining invisible characters
        return normalized.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
      })
      
      // Debug: check what we're looking for
      const nameVariations = ['fullname', 'name', 'contactname', 'clientname']
      const phoneVariations = ['phonenumber', 'phone', 'mobile', 'contact', 'tel', 'telephone']
      
      // Check for name column - exact match or contains
      // First, clean all normalized columns
      const cleanedNormalized = normalizedColumns.map(c => c.replace(/[\uFEFF\u200B-\u200D\u2060]/g, ''))
      
      // Debug: log what we're checking
      console.log('Cleaned normalized columns:', cleanedNormalized)
      console.log('Looking for name in:', cleanedNormalized)
      console.log('Looking for phone in:', cleanedNormalized)
      
      // Check for name - be very explicit
      const hasName = cleanedNormalized.includes('fullname') || 
                     cleanedNormalized.includes('name') ||
                     cleanedNormalized.some(c => c.indexOf('fullname') >= 0) ||
                     cleanedNormalized.some(c => c.indexOf('name') >= 0 && c !== 'phonenumber' && c !== 'campaignname')
      
      // Check for phone - be very explicit
      const hasPhone = cleanedNormalized.includes('phonenumber') || 
                      cleanedNormalized.includes('phone') ||
                      cleanedNormalized.some(c => c.indexOf('phonenumber') >= 0) ||
                      cleanedNormalized.some(c => c.indexOf('phone') >= 0)
      
      console.log('Name found:', hasName, 'Phone found:', hasPhone)

      if (!hasName || !hasPhone) {
        // Show both raw and cleaned columns for debugging
        setError(
          `Required columns not found.\n\n` +
          `Raw columns: ${rawColumns.join(', ')}\n` +
          `Cleaned columns: ${columns.join(', ')}\n` +
          `Normalized: ${normalizedColumns.join(', ')}\n\n` +
          `Looking for: full_name (or name) and phone_number (or phone)\n` +
          `Name found: ${hasName}, Phone found: ${hasPhone}`
        )
        setUploading(false)
        return
      }

      // Clean function to remove null bytes and fix UTF-16 encoding issues
      const cleanString = (str: any): string => {
        if (str === null || str === undefined) return ''
        let cleaned = String(str)
        // Remove null bytes (UTF-16 encoding artifact)
        cleaned = cleaned.replace(/\u0000/g, '')
        // Remove other control characters except newlines and tabs
        cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        // Remove quotes if they wrap the entire string
        cleaned = cleaned.replace(/^["']|["']$/g, '')
        return cleaned.trim()
      }
      
      // Special cleaning for phone numbers
      const cleanPhone = (phone: any): string => {
        if (!phone) return ''
        let cleaned = cleanString(phone)
        // Remove "p:" prefix and other common phone prefixes
        cleaned = cleaned.replace(/^(p|tel|phone|mobile):/i, '').trim()
        return cleaned
      }

      // Transform leads
      const transformedLeads = transformLeads(parsedData)

      // Clean all string values to remove null bytes
      const cleanedLeads = transformedLeads.map(lead => {
        const cleaned: any = { ...lead }
        Object.keys(cleaned).forEach(key => {
          if (key === 'phone' && typeof cleaned[key] === 'string') {
            // Special cleaning for phone numbers
            cleaned[key] = cleanPhone(cleaned[key])
          } else if (typeof cleaned[key] === 'string') {
            cleaned[key] = cleanString(cleaned[key])
          } else if (cleaned[key] && typeof cleaned[key] === 'object' && !Array.isArray(cleaned[key])) {
            // Clean meta_data object
            const cleanedMeta: any = {}
            Object.keys(cleaned[key]).forEach(metaKey => {
              if (typeof cleaned[key][metaKey] === 'string') {
                cleanedMeta[metaKey] = cleanString(cleaned[key][metaKey])
              } else {
                cleanedMeta[metaKey] = cleaned[key][metaKey]
              }
            })
            cleaned[key] = cleanedMeta
          }
        })
        return cleaned
      })

      // Debug: log first transformed lead
      if (cleanedLeads.length > 0) {
        console.log('First cleaned lead:', cleanedLeads[0])
        console.log('Has name:', !!cleanedLeads[0].name, 'Has phone:', !!cleanedLeads[0].phone)
      }

      // Filter out invalid leads (must have name and phone)
      const validLeads = cleanedLeads.filter(
        (lead) => lead.name && lead.phone && String(lead.name).trim() && String(lead.phone).trim()
      )
      
      console.log(`Transformed ${transformedLeads.length} leads, ${validLeads.length} are valid`)

      if (validLeads.length === 0) {
        // Provide more helpful error message with actual column names
        const sampleRow = parsedData[0] || {}
        const availableColumns = Object.keys(sampleRow).join(', ')
        setError(
          `No valid leads found. Please ensure the file contains name and phone number columns.\n` +
          `Available columns in your file: ${availableColumns}\n` +
          `Looking for: full_name (or name) and phone_number (or phone)`
        )
        setUploading(false)
        return
      }

      // Upload in larger batches for better performance (100 leads per batch)
      const batchSize = 100
      const batches = []
      for (let i = 0; i < validLeads.length; i += batchSize) {
        batches.push(validLeads.slice(i, i + batchSize))
      }

      let totalSuccess = 0
      let totalFailed = 0
      const allFailed: any[] = []

      for (const batch of batches) {
        const response = await fetch('/api/leads/bulk-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ leads: batch }),
        })

        const result = await response.json()

        if (response.ok) {
          totalSuccess += result.success || 0
          totalFailed += result.failed || 0
          if (result.results?.failed) {
            allFailed.push(...result.results.failed)
          }
          // Log any errors for debugging
          if (result.results?.failed && result.results.failed.length > 0) {
            console.error('Failed leads in batch:', result.results.failed)
            // Log first few errors in detail
            result.results.failed.slice(0, 5).forEach((failed: any) => {
              console.error(`Row ${failed.row} error:`, failed.error)
              console.error(`Row ${failed.row} data:`, failed.data)
            })
          }
          
          // Also log successful ones to see the pattern
          if (result.results?.success && result.results.success.length > 0) {
            console.log('Successful leads:', result.results.success.length)
          }
        } else {
          console.error('Batch upload failed:', result)
          totalFailed += batch.length
          allFailed.push(...batch.map((lead: any, idx: number) => ({
            row: idx + 1,
            data: lead,
            error: result.error || 'Upload failed',
          })))
        }
      }

      setUploadResults({
        total: validLeads.length,
        success: totalSuccess,
        failed: totalFailed,
        failedDetails: allFailed,
      })

      if (totalSuccess > 0) {
        setSuccess(`Successfully uploaded ${totalSuccess} lead(s)${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`)
        // Refresh leads list after 2 seconds
        setTimeout(() => {
          router.push('/leads')
        }, 2000)
      } else {
        // Show detailed error message
        const firstError = allFailed.length > 0 ? allFailed[0] : null
        const errorMsg = firstError 
          ? `Failed to upload leads. First error (row ${firstError.row}): ${firstError.error}`
          : `Failed to upload leads. ${totalFailed} error(s) occurred.`
        setError(errorMsg)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload leads')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <button
              onClick={() => router.back()}
              className="text-indigo-600 hover:text-indigo-800 mb-4"
            >
              ← Back to Leads
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Upload Leads</h1>
            <p className="text-gray-600 mt-2">
              Upload leads from CSV, Excel, or Numbers files. Supported formats: CSV, XLS, XLSX
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
              {success}
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>

            {preview.length > 0 && (
              <div className="mt-6">
                <div className="mb-4 flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">Preview (First 5 rows)</h3>
                  <span className="text-sm text-gray-600">
                    Total rows: {allData.length}
                  </span>
                </div>
                
                {/* Show detected columns */}
                {preview.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-sm font-medium text-blue-900 mb-1">Detected Columns:</p>
                    <p className="text-xs text-blue-700">
                      {Object.keys(preview[0] || {}).join(', ')}
                    </p>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(preview[0] || {}).map((key) => (
                          <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase border">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.map((row, idx) => (
                        <tr key={idx}>
                          {Object.keys(preview[0] || {}).map((key) => (
                            <td key={key} className="px-4 py-2 text-sm text-gray-900 border">
                              {String(row[key] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <button
                    onClick={handleUpload}
                    disabled={uploading || loading}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? 'Uploading...' : 'Upload All Leads'}
                  </button>
                  {loading && <span className="text-sm text-gray-500">Parsing file...</span>}
                </div>
              </div>
            )}

            {uploadResults && (
              <div className="mt-6 p-4 bg-gray-50 rounded">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Results</h3>
                <p>Total: {uploadResults.total}</p>
                <p className="text-green-600">Success: {uploadResults.success}</p>
                <p className="text-red-600">Failed: {uploadResults.failed}</p>
                {uploadResults.failedDetails && uploadResults.failedDetails.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Failed Rows:</h4>
                    <div className="max-h-40 overflow-y-auto">
                      {uploadResults.failedDetails.slice(0, 10).map((failed: any, idx: number) => (
                        <div key={idx} className="text-sm text-red-600 mb-1">
                          Row {failed.row}: {failed.error}
                        </div>
                      ))}
                      {uploadResults.failedDetails.length > 10 && (
                        <div className="text-sm text-gray-500">
                          ... and {uploadResults.failedDetails.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Expected File Format</h3>
            <p className="text-sm text-blue-800 mb-2">
              Your file should include the following columns (column names can vary):
            </p>
            <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
              <li><strong>full_name</strong> or <strong>Full Name</strong> - Required</li>
              <li><strong>phone_number</strong> or <strong>Phone Number</strong> - Required</li>
              <li><strong>ad_id</strong>, <strong>ad_name</strong>, <strong>campaign_id</strong>, <strong>campaign_name</strong> - Optional</li>
              <li><strong>what_services_are_you_looking_for?</strong> - Optional (stored as requirement)</li>
              <li>Other fields will be stored in metadata</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  )
}
