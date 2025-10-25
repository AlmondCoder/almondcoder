import type React from 'react'
import { useState } from 'react'
import { GitBranch, Loader } from 'lucide-react'
import { Modal } from './modal'

interface CloneRepositoryModalProps {
  isOpen: boolean
  onClose: () => void
  onClone: (url: string) => Promise<void>
}

export function CloneRepositoryModal({
  isOpen,
  onClose,
  onClone,
}: CloneRepositoryModalProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsLoading(true)
    setError('')

    try {
      await onClone(repoUrl.trim())
      setRepoUrl('')
      onClose()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to clone repository'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setRepoUrl('')
      setError('')
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Clone Git Repository">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            className="block text-sm font-medium text-gray-300 mb-2"
            htmlFor="repo-url"
          >
            Repository URL
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
              <GitBranch className="h-4 w-4 text-gray-400" />
            </div>
            <input
              autoFocus
              className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md leading-5 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
              id="repo-url"
              onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repository.git"
              value={repoUrl}
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            disabled={isLoading || !repoUrl.trim()}
            type="submit"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Cloning...</span>
              </>
            ) : (
              <span>Clone Repository</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
