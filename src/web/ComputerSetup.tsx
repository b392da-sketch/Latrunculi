import { useEffect, useRef, useState } from 'react'
import { difficulties, difficultyIds } from '../ai/difficulties.js'
import type { DifficultyId } from '../ai/difficulties.js'
import type { Player } from '../engine/index.js'
import { computerConfig } from './match-config.js'
import type { ComputerConfig } from './match-config.js'

export function ComputerSetup({ onStart, onBack }: {
  onStart(config: ComputerConfig): void
  onBack(): void
}) {
  const [difficulty, setDifficulty] = useState<DifficultyId>('centurio')
  const [side, setSide] = useState<Player | 'random'>('white')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return <section className="secondary computer-setup">
    <button className="quiet back" onClick={onBack}>← Back</button>
    <article className="reading">
      <p className="eyebrow">New match</p>
      <h1 ref={heading} tabIndex={-1}>Play the computer</h1>
      <form onSubmit={event => {
        event.preventDefault()
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
        onStart(computerConfig(difficulty, side, seed))
      }}>
        <fieldset className="opponent-options">
          <legend>Choose an opponent</legend>
          <div className="opponent-grid">
            {difficultyIds.map(id => {
              const entry = difficulties[id]
              return <label key={id} className={`opponent-option ${difficulty === id ? 'chosen' : ''}`}>
                <input type="radio" name="difficulty" value={id} checked={difficulty === id}
                  onChange={() => setDifficulty(id)}
                  aria-label={`${entry.name} — ${entry.designation}`} aria-describedby={`opponent-${id}`} />
                <span><strong>{entry.name}</strong><small>{entry.designation}{id === 'centurio' ? ' · Recommended' : ''}</small>
                  <span className="opponent-description" id={`opponent-${id}`}>{entry.description}</span></span>
              </label>
            })}
          </div>
        </fieldset>
        <fieldset className="side-options">
          <legend>Choose your side</legend>
          {([['white', 'White · Ivory'], ['black', 'Black · Obsidian'], ['random', 'Random side']] as const)
            .map(([value, label]) => <label key={value}><input type="radio" name="side" checked={side === value}
              onChange={() => setSide(value)} /> {label}</label>)}
          <p>{side === 'white' ? 'You place first.' : side === 'black' ? 'The computer places first.' : 'White places first. Your side is assigned when the match starts.'}</p>
        </fieldset>
        <button className="button primary">Start match</button>
      </form>
    </article>
  </section>
}
