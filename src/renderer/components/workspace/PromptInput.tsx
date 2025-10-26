import { useState, useRef, useEffect } from 'react'
import { Plus, X, ArrowUp, ChevronDown } from 'lucide-react'
import { useTheme } from '../../theme/ThemeContext'

interface PromptInputProps {
  onExecute: (prompt: string) => void
  isNewConversation: boolean
  isExecuting: boolean
  projectContext: any
  selectedBranch: string
  availableBranches: string[]
  onBranchSelect: (branch: string) => void
  onWorktreeSelect: (worktree: string | null) => void
  getAvailableBranchesForNewPrompt: () => string[]
  onNewConversation?: () => void
}

export function PromptInput({
  onExecute,
  isNewConversation,
  isExecuting,
  projectContext,
  selectedBranch,
  availableBranches,
  onBranchSelect,
  onWorktreeSelect,
  getAvailableBranchesForNewPrompt,
  onNewConversation,
}: PromptInputProps) {
  const { theme, themeName } = useTheme()
  const isLightTheme = themeName === 'light'

  const [currentPrompt, setCurrentPrompt] = useState('')
  const [selectedPills, setSelectedPills] = useState<
    Array<{ label: string; text: string }>
  >([])
  const [isPillDropdownOpen, setIsPillDropdownOpen] = useState(false)
  const [pillSearchText, setPillSearchText] = useState('')
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)

  const pillDropdownRef = useRef<HTMLDivElement>(null)

  // Close pill dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pillDropdownRef.current &&
        !pillDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPillDropdownOpen(false)
        setPillSearchText('')
      }
    }

    if (isPillDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isPillDropdownOpen])

  // Prompt pills data
  const promptPills = [
    {
      label: 'Code Planner',
      text: 'Can you tell me 2-3 plans to implement this feautre, go through the code properly and try and reuse existing code instead of giving me new code. Be concise and direct with your plan and recommend me the best plan to implement.',
    },
    {
      label: 'Expert Frontend Developer',
      text: 'You are an expert frontend developer with lot of experience, please ensure that that the brand colors #FFFFFF, #151312, #66645F, #B0B0AB, #D2D2D0, #DEDEDB, #000000 are being used for this feature. Ensure you reuse components whereever possible.',
    },
    {
      label: 'Backend Architect',
      text: 'You are an expert backend architect which can devise a database design along with backend architechture using the right recommended tools.',
    },
    {
      label: 'Bug Fix',
      text: 'I have a bug that needs fixing. Run the bash terminal with the command pnpm run dev and look at the logs to find the error mentioned. Find the source of the big and fix it.',
    },
  ]

  const handleAddPill = (pill: { label: string; text: string }) => {
    // Check if pill is already selected
    if (selectedPills.some(p => p.label === pill.label)) {
      return
    }

    setSelectedPills(prev => [...prev, pill])

    // Add pill text to current prompt
    setCurrentPrompt(prev =>
      prev.trim()
        ? prev + (prev.endsWith(' ') ? '' : ' ') + pill.text
        : pill.text
    )

    // Close dropdown and reset search
    setIsPillDropdownOpen(false)
    setPillSearchText('')
  }

  const handleRemovePill = (pillLabel: string) => {
    const pillToRemove = selectedPills.find(p => p.label === pillLabel)
    if (!pillToRemove) return

    setSelectedPills(prev => prev.filter(p => p.label !== pillLabel))

    // Remove pill text from current prompt
    setCurrentPrompt(prev =>
      prev.replace(pillToRemove.text, '').replace(/\s+/g, ' ').trim()
    )
  }

  const getFilteredPills = () => {
    if (!pillSearchText.trim()) {
      return promptPills
    }

    const search = pillSearchText.toLowerCase()
    return promptPills.filter(
      pill =>
        pill.label.toLowerCase().includes(search) ||
        pill.text.toLowerCase().includes(search)
    )
  }

  const handleExecute = () => {
    if (currentPrompt.trim()) {
      onExecute(currentPrompt.trim())
      setCurrentPrompt('')
      setSelectedPills([])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleExecute()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentPrompt(e.target.value)
    // Set to New Prompt when user types in a new conversation
    if (isNewConversation && onNewConversation) {
      onNewConversation()
    }
  }

  return (
    <div
      className={`${isNewConversation ? '' : 'border border-t-0 rounded-none rounded-b-lg'} ${
        isLightTheme
          ? isNewConversation
            ? 'bg-white border border-gray-300'
            : 'bg-white border-gray-300'
          : isNewConversation
            ? 'bg-gray-800 border border-gray-700'
            : 'bg-gray-800 border-gray-700'
      } ${isNewConversation ? 'rounded-lg' : ''}`}
    >
      {/* Textarea with bottom controls */}
      <div className="relative">
        <textarea
          className={`w-full p-4 pb-0 outline-none bg-transparent resize-none focus:outline-none ${
            isNewConversation ? 'min-h-[120px] max-h-[120px]' : 'h-[70px] max-h-[70px]'
          } ${
            isLightTheme
              ? 'text-gray-900 placeholder-gray-400'
              : 'text-white placeholder-gray-500'
          }`}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isNewConversation
              ? 'Enter your prompt here...'
              : 'Do something else'
          }
          style={{
            fontSize: isNewConversation ? '0.875rem' : undefined,
            overflowY: 'auto',
            paddingBottom: '4px'
          }}
          value={currentPrompt}
        />

        {/* Spacer to push controls down and create visual separation */}
        <div className="h-[58px]"></div>

        {/* Bottom bar with controls */}
        <div className="absolute left-0 right-0 bottom-0 px-3 pb-3 flex items-center justify-between gap-2">
          {/* Left side: Plus icon and selected pills */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Plus Icon Button with Dropdown */}
            <div className="relative" ref={pillDropdownRef}>
              <button
                className={`w-8 h-8 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                  isLightTheme
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                }`}
                onClick={() => setIsPillDropdownOpen(!isPillDropdownOpen)}
                title="Add prompt template"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Dropdown with Typeahead - Opens Upward */}
              {isPillDropdownOpen && (
                <div
                  className={`absolute bottom-full left-0 mb-2 rounded-lg shadow-xl z-50 w-80 ${
                    isLightTheme
                      ? 'bg-white border border-gray-200'
                      : 'bg-gray-800 border border-gray-700'
                  }`}
                >
                  {/* Filtered Pills List */}
                  <div className="max-h-64 overflow-y-auto">
                    {getFilteredPills().length > 0 ? (
                      getFilteredPills().map((pill, index) => {
                        const isSelected = selectedPills.some(
                          p => p.label === pill.label
                        )
                        return (
                          <button
                            className={`w-full text-left px-4 py-3 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                              isSelected
                                ? isLightTheme
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : isLightTheme
                                  ? 'hover:bg-gray-50 text-gray-900'
                                  : 'hover:bg-gray-700 text-gray-200'
                            }`}
                            disabled={isSelected}
                            key={index}
                            onClick={() => !isSelected && handleAddPill(pill)}
                          >
                            <div className="font-medium text-sm">
                              {pill.label}
                            </div>
                            <div
                              className={`text-xs mt-1 ${
                                isLightTheme ? 'text-gray-500' : 'text-gray-400'
                              }`}
                            >
                              {pill.text.substring(0, 60)}...
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div
                        className={`px-4 py-8 text-center text-sm ${
                          isLightTheme ? 'text-gray-500' : 'text-gray-400'
                        }`}
                      >
                        No templates found
                      </div>
                    )}
                  </div>

                  {/* Search Input at Bottom */}
                  <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                    <input
                      autoFocus
                      className={`w-full px-3 py-2 rounded-md text-sm outline-none ${
                        isLightTheme
                          ? 'bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400'
                          : 'bg-gray-700 border border-gray-600 text-white placeholder-gray-500'
                      }`}
                      onChange={e => setPillSearchText(e.target.value)}
                      placeholder="Search templates..."
                      type="text"
                      value={pillSearchText}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Selected Pills Display */}
            <div className="flex flex-wrap gap-2 flex-1 min-w-0 overflow-x-auto">
              {selectedPills.map((pill, index) => (
                <div
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs border flex-shrink-0 ${
                    isLightTheme
                      ? 'bg-white border-gray-300 text-gray-700'
                      : 'bg-gray-800 border-gray-600 text-gray-200'
                  }`}
                  key={index}
                >
                  <span className="truncate max-w-[150px]">{pill.label}</span>
                  <button
                    className={`hover:opacity-70 transition-opacity ${
                      isLightTheme ? 'text-gray-500' : 'text-gray-400'
                    }`}
                    onClick={() => handleRemovePill(pill.label)}
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Branch Dropdown - Only show for new conversations */}
            {isNewConversation && (
              <div className="relative">
                <button
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isLightTheme
                      ? 'text-gray-700 bg-gray-50 hover:bg-gray-100 border-gray-300'
                      : 'text-gray-300 bg-gray-700 hover:bg-gray-600 border-gray-600'
                  }`}
                  disabled={availableBranches.length === 0}
                  onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                >
                  <span>{selectedBranch || 'Select Branch'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {isBranchDropdownOpen && availableBranches.length > 0 && (
                  <div
                    className={`absolute bottom-full right-0 mb-2 rounded-lg shadow-xl z-20 min-w-[280px] max-h-48 overflow-y-auto ${
                      isLightTheme
                        ? 'bg-white border border-gray-300'
                        : 'bg-gray-800 border border-gray-700'
                    }`}
                  >
                    {getAvailableBranchesForNewPrompt().map(branch => (
                      <button
                        className={`w-full text-left px-4 py-3 first:rounded-t-lg last:rounded-b-lg transition-colors ${
                          isLightTheme
                            ? `hover:bg-gray-50 ${branch === selectedBranch ? 'bg-gray-50' : ''}`
                            : `hover:bg-gray-700 ${branch === selectedBranch ? 'bg-gray-700' : ''}`
                        }`}
                        key={branch}
                        onClick={() => {
                          onBranchSelect(branch)
                          onWorktreeSelect(null)
                          setIsBranchDropdownOpen(false)
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={
                              isLightTheme ? 'text-gray-600' : 'text-gray-400'
                            }
                          >
                            •
                          </span>
                          <div
                            className={`text-sm ${isLightTheme ? 'text-gray-700' : 'text-gray-300'}`}
                          >
                            {branch}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right side: Execute button */}
          <button
            className={`disabled:opacity-50 disabled:cursor-not-allowed p-2 rounded transition-colors flex items-center justify-center flex-shrink-0 ${
              isExecuting
                ? isLightTheme
                  ? 'bg-gray-400'
                  : 'bg-gray-600'
                : isLightTheme
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-white hover:bg-gray-200'
            }`}
            disabled={
              !projectContext ||
              !currentPrompt.trim() ||
              (isNewConversation && !selectedBranch) ||
              isExecuting
            }
            onClick={handleExecute}
            title={
              !projectContext
                ? 'Please select a project first'
                : !currentPrompt.trim()
                  ? 'Please enter a prompt'
                  : isNewConversation && !selectedBranch
                    ? 'Please select a branch'
                    : isExecuting
                      ? 'This conversation is currently executing'
                      : isNewConversation
                        ? 'Create new conversation and execute'
                        : 'Execute the prompt'
            }
          >
            <ArrowUp
              className={`w-4 h-4 ${
                isExecuting
                  ? isLightTheme
                    ? 'text-white'
                    : 'text-gray-300'
                  : isLightTheme
                    ? 'text-white'
                    : 'text-black'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
