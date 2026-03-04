"use client"

import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type TagInputProps = {
  label: string
  placeholder: string
  value: string[]
  onChange: (next: string[]) => void
}

export function TagInput({ label, placeholder, value, onChange }: TagInputProps) {
  const addTag = (raw: string) => {
    const tag = raw.trim()

    if (!tag || value.includes(tag)) {
      return
    }

    onChange([...value, tag])
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input
        placeholder={placeholder}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            addTag(event.currentTarget.value)
            event.currentTarget.value = ""
          }
        }}
      />
      <div className="flex min-h-9 flex-wrap gap-2 rounded-md border px-2 py-2">
        {value.length > 0 ? (
          value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              <span>{tag}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-4"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                aria-label={`Remove ${tag}`}
              >
                <XIcon className="size-3" />
              </Button>
            </Badge>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            Press Enter to add tags.
          </p>
        )}
      </div>
    </div>
  )
}
