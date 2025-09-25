export function Terminal() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Terminal</h2>
      <div className="space-y-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">Terminals</h3>
          <p className="text-gray-300">
            Terminal instances and management section.
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">Settings</h3>
          <p className="text-gray-300">
            Terminal configuration and settings section.
          </p>
        </div>
      </div>
    </div>
  )
}
