#include "graph.h"
#include <iostream>
#include <algorithm>

namespace prism {

ReferenceGraph::ReferenceGraph() {}

ReferenceGraph::~ReferenceGraph() {}

void ReferenceGraph::addSymbol(const Symbol& symbol) {
  symbols_[symbol.id] = symbol;
}

void ReferenceGraph::addSymbols(const std::vector<Symbol>& symbols) {
  for (const auto& symbol : symbols) {
    addSymbol(symbol);
  }
}

bool ReferenceGraph::hasSymbol(const std::string& symbolId) const {
  return symbols_.find(symbolId) != symbols_.end();
}

Symbol ReferenceGraph::getSymbol(const std::string& symbolId) const {
  auto it = symbols_.find(symbolId);
  if (it != symbols_.end()) {
    return it->second;
  }
  return Symbol(); // Return empty/default symbol
}

std::vector<Symbol> ReferenceGraph::getAllSymbols() const {
  std::vector<Symbol> result;
  result.reserve(symbols_.size());
  for (const auto& pair : symbols_) {
    result.push_back(pair.second);
  }
  return result;
}

void ReferenceGraph::addReference(const Reference& reference) {
  references_[reference.id] = reference;
  symbolToReferences_[reference.fromSymbolId].push_back(reference.id);
  symbolToCallers_[reference.toSymbolId].push_back(reference.id);
}

void ReferenceGraph::addReferences(const std::vector<Reference>& references) {
  for (const auto& ref : references) {
    addReference(ref);
  }
}

void ReferenceGraph::removeReferences(const std::string& symbolId) {
    // Remove references originating from this symbol
    auto it = symbolToReferences_.find(symbolId);
    if (it != symbolToReferences_.end()) {
        for (const auto& refId : it->second) {
            auto refIt = references_.find(refId);
            if (refIt != references_.end()) {
                // Also remove from symbolToCallers_ of the target
                auto& callers = symbolToCallers_[refIt->second.toSymbolId];
                callers.erase(std::remove(callers.begin(), callers.end(), refId), callers.end());
                references_.erase(refIt);
            }
        }
        symbolToReferences_.erase(it);
    }
}

std::vector<Reference> ReferenceGraph::findCallers(const std::string& symbolId) const {
  std::vector<Reference> result;
  auto it = symbolToCallers_.find(symbolId);
  if (it != symbolToCallers_.end()) {
    for (const auto& refId : it->second) {
      auto refIt = references_.find(refId);
      if (refIt != references_.end()) {
        result.push_back(refIt->second);
      }
    }
  }
  return result;
}

std::vector<Reference> ReferenceGraph::findCallees(const std::string& symbolId) const {
  std::vector<Reference> result;
  auto it = symbolToReferences_.find(symbolId);
  if (it != symbolToReferences_.end()) {
    for (const auto& refId : it->second) {
      auto refIt = references_.find(refId);
      if (refIt != references_.end()) {
        result.push_back(refIt->second);
      }
    }
  }
  return result;
}

void ReferenceGraph::addFile(const FileData& file) {
  files_[file.path] = file;
  addSymbols(file.symbols);
}

void ReferenceGraph::updateFile(const std::string& filePath, const FileData& file) {
  removeFile(filePath);
  addFile(file);
}

void ReferenceGraph::removeFile(const std::string& filePath) {
  auto it = files_.find(filePath);
  if (it != files_.end()) {
    // Remove symbols defined in this file
    for (const auto& sym : it->second.symbols) {
        removeReferences(sym.id); // Remove references FROM this symbol
        symbols_.erase(sym.id);
        
        // Remove references TO this symbol
        auto callersIt = symbolToCallers_.find(sym.id);
        if (callersIt != symbolToCallers_.end()) {
             for (const auto& refId : callersIt->second) {
                 auto refIt = references_.find(refId);
                 if (refIt != references_.end()) {
                     auto& outgoing = symbolToReferences_[refIt->second.fromSymbolId];
                     outgoing.erase(std::remove(outgoing.begin(), outgoing.end(), refId), outgoing.end());
                     references_.erase(refIt);
                 }
             }
             symbolToCallers_.erase(callersIt);
        }
    }
    files_.erase(it);
  }
}

void ReferenceGraph::markFileDirty(const std::string& filePath) {
  dirtyFiles_.insert(filePath);
}

void ReferenceGraph::clearDirtyFiles() {
  dirtyFiles_.clear();
}

bool ReferenceGraph::hasFile(const std::string& filePath) const {
  return files_.find(filePath) != files_.end();
}

bool ReferenceGraph::isSymbolUsed(const std::string& symbolId) const {
  auto it = symbolToCallers_.find(symbolId);
  return it != symbolToCallers_.end() && !it->second.empty();
}

std::vector<Symbol> ReferenceGraph::findUnusedSymbols() const {
  std::vector<Symbol> unused;
  for (const auto& pair : symbols_) {
    if (!isSymbolUsed(pair.first)) {
      unused.push_back(pair.second);
    }
  }
  return unused;
}

std::vector<Symbol> ReferenceGraph::findSymbolsByName(const std::string& name) const {
  std::vector<Symbol> result;
  for (const auto& pair : symbols_) {
    if (pair.second.name == name) {
      result.push_back(pair.second);
    }
  }
  return result;
}

std::vector<Symbol> ReferenceGraph::findSymbolsByFile(const std::string& filePath) const {
  std::vector<Symbol> result;
  auto it = files_.find(filePath);
  if (it != files_.end()) {
      return it->second.symbols;
  }
  return result;
}

std::vector<Symbol> ReferenceGraph::findExportedSymbols() const {
  std::vector<Symbol> result;
  for (const auto& pair : symbols_) {
    if (pair.second.isExported) {
      result.push_back(pair.second);
    }
  }
  return result;
}

GraphStats ReferenceGraph::getStats() const {
  GraphStats stats;
  stats.totalSymbols = symbols_.size();
  stats.totalReferences = references_.size();
  stats.totalFiles = files_.size();
  stats.memoryUsageBytes = calculateMemoryUsage();
  return stats;
}

size_t ReferenceGraph::size() const {
  return symbols_.size();
}

void ReferenceGraph::clear() {
  symbols_.clear();
  references_.clear();
  symbolToReferences_.clear();
  symbolToCallers_.clear();
  files_.clear();
  dirtyFiles_.clear();
}

std::string ReferenceGraph::generateSymbolId(const std::string& name, const std::string& filePath, int line) const {
  return filePath + "::" + name + "::" + std::to_string(line);
}

size_t ReferenceGraph::calculateMemoryUsage() const {
  size_t size = 0;
  size += symbols_.size() * sizeof(Symbol);
  size += references_.size() * sizeof(Reference);
  size += files_.size() * sizeof(FileData);
  // Approximation, ignoring dynamic string allocations for now
  return size;
}

} // namespace prism
