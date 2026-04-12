export async function createApplication() {
  return {
    application: {
      id: 'mock-app-id',
      name: 'Mock Application',
      slug: 'mock-application',
      description: 'A mock application',
      repositoryPath: '/mock/path',
      additionalPaths: [],
      status: 'Idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    repositoryPath: '/mock/path',
  };
}
