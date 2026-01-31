import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get('q') || '').toLowerCase()

    if (!query) {
      return NextResponse.json([])
    }

    // Extract the first English word as the main keyword
    const englishWords = query.match(/[a-zA-Z]+/g) || []
    const keyword = englishWords.length > 0 ? englishWords[0] : query

    if (keyword.length < 2) {
      return NextResponse.json([])
    }

    const { data, error } = await supabase
      .from('script_templates')
      .select('*')
      .or(`name.ilike.%${keyword}%,description.ilike.%${keyword}%,document_content.ilike.%${keyword}%`)
      .limit(10)

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err) {
    console.error('Search scripts failed:', err)
    return NextResponse.json([])
  }
}
