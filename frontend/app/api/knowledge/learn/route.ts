import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Extract keywords from text
function extractKeywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
  const stopWords = ['the', 'and', 'for', 'with', 'how', 'what', 'please']
  return [...new Set(words.filter(w => !stopWords.includes(w)))].slice(0, 10)
}

// Detect category from task and commands
function detectCategory(task: string, commands: string[]): string {
  const text = (task + ' ' + commands.join(' ')).toLowerCase()
  if (text.includes('docker') || text.includes('container')) return 'docker'
  if (text.includes('nginx') || text.includes('deploy') || text.includes('pm2')) return 'deployment'
  if (text.includes('firewall') || text.includes('ssl') || text.includes('cert')) return 'security'
  if (text.includes('port') || text.includes('network') || text.includes('ping')) return 'network'
  if (text.includes('disk') || text.includes('memory') || text.includes('cpu')) return 'system'
  return 'custom'
}

export async function POST(request: NextRequest) {
  try {
    const { task, commands, result, success } = await request.json()

    if (!success) {
      return NextResponse.json({ success: true, learned: false, message: 'Only successful executions are saved' })
    }

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task is required' }, { status: 400 })
    }

    const keywords = extractKeywords(task)
    const category = detectCategory(task, commands || [])
    const title = task.substring(0, 100)

    // Check if already exists
    const { data: existing } = await supabase
      .from('knowledge_items')
      .select('id')
      .eq('title', title)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, learned: false, message: 'Already exists' })
    }

    // Insert new knowledge item
    const { data, error } = await supabase
      .from('knowledge_items')
      .insert({
        title,
        keywords,
        solution: `Task: ${task}\n\nCommands:\n${(commands || []).join('\n')}\n\nResult:\n${(result || '').substring(0, 500)}`,
        commands: commands || [],
        category,
        synced_to_github: false
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to save knowledge:', error)
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, learned: true, item: data })
  } catch (err) {
    console.error('Knowledge learn failed:', err)
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 })
  }
}
