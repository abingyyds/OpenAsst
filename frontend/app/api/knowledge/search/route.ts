import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get('q') || '').toLowerCase()

    if (!query || query.length < 2) {
      return NextResponse.json([])
    }

    // Fetch all and filter client-side for flexible matching
    const { data, error } = await supabase
      .from('knowledge_items')
      .select('*')

    if (error) throw error

    const results = (data || []).filter(item => {
      const titleMatch = item.title?.toLowerCase().includes(query)
      const keywordMatch = item.keywords?.some((k: string) =>
        k.toLowerCase().includes(query)
      )
      const solutionMatch = item.solution?.toLowerCase().includes(query)
      return titleMatch || keywordMatch || solutionMatch
    })

    return NextResponse.json(results.slice(0, 20))
  } catch (err) {
    console.error('Knowledge search failed:', err)
    return NextResponse.json([])
  }
}
