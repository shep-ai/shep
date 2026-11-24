import XCTest

@testable import ShepKit

final class DiffDocumentTests: XCTestCase {
    func testSplitsAPatchIntoFilesWithTheirCounts() throws {
        let detail = try Fixtures.decode(TaskDetail.self, "task-detail-ready")
        let diff = DiffDocument(patch: try XCTUnwrap(detail.diff))
        XCTAssertEqual(diff.files.map(\.path), ["src/auth/redirect.ts", "README.md"])
        XCTAssertEqual(diff.files.map(\.added), [2, 1])
        XCTAssertEqual(diff.files.map(\.removed), [1, 0])
        XCTAssertEqual(diff.summary, "2 files · +3 -1")
    }

    func testKeepsHunksAndLineKinds() throws {
        let patch = """
        diff --git a/a.ts b/a.ts
        --- a/a.ts
        +++ b/a.ts
        @@ -1,2 +1,2 @@
         keep
        -old
        +new
        """
        let file = try XCTUnwrap(DiffDocument(patch: patch).files.first)
        XCTAssertEqual(file.lines.map(\.kind), [.hunk, .context, .removed, .added])
        XCTAssertEqual(file.lines.map(\.text), ["@@ -1,2 +1,2 @@", "keep", "old", "new"])
    }

    func testANewFileIsNamedByItsNewPath() throws {
        let patch = "diff --git a/n.txt b/n.txt\nnew file mode 100644\n--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1 @@\n+hi\n"
        XCTAssertEqual(DiffDocument(patch: patch).files.first?.path, "n.txt")
    }

    func testNoPatchMeansNoFiles() {
        XCTAssertEqual(DiffDocument(patch: "").files, [])
        XCTAssertEqual(DiffDocument(patch: "").summary, "No changes yet")
    }
}
