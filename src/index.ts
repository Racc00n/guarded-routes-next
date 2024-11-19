
type BaseGuardedRoutes = any; //Record<string, Record<string,any> | Array<any>>;
export type GetApplicationGuardedRoutesFunc<TGuardedRoutes extends BaseGuardedRoutes> = () => TGuardedRoutes;
type NextResponse = any;
type NextRequest = any;

export const searchMapForRoute = <T>(
  pathname: string,
  routes: Record<string, T>
): T | undefined => {
  if (routes[pathname]) return routes[pathname];
  // some routes in routes can appear with an *, for example a/b/c/*, so we need to check if the pathname includes the key
  // we want to strip 1 layer of the pathname and check if it includes the key with an *
  const pathParts = pathname.split('/');
  for (let i = pathParts.length; i > 0; i--) {
    const path = pathParts.slice(0, i).join('/');
    if (routes[`${path}/*`]) return routes[`${path}/*`];
  }
  return undefined;
};

export interface GenerateGuardedRoutesParams<TGuardedRoutes extends BaseGuardedRoutes> {
  /**
   * The main function that performs all the checks, wrapped with a function that gives it the merged
   * application guarded routes (the result of this is the isPathAllowed function
   * @param getApplicationGuardedRoutes
   */
  isPathAllowedWithGetApplicationGuardedRoutes: (getApplicationGuardedRoutes: GetApplicationGuardedRoutesFunc<TGuardedRoutes>) => (path: string) => Promise<boolean>;
  /**
   * An initial value for the merging of the application guarded routes.
   * pay attention - you also need to provide the init value for optional properties
   */
  initValue: TGuardedRoutes;
  /**
   * The unmerged array of guarded routes. the division is usually per layout/feature
   */
  applicationGuardedRoutes: TGuardedRoutes[];
  /**
   * This function defines how your middleware will behave in case isPathAllowed returns a false.
   * @param getApplicationGuardedRoutes
   */
  middlewareReject: (getApplicationGuardedRoutes: GetApplicationGuardedRoutesFunc<TGuardedRoutes>) => (nextRequest: NextRequest) => NextResponse;
}

export interface GeneratedGuardedRoutesReturnType {
  /**
   * gets a path and returns (as a promise) if it's allowed or not.
   * @param path
   */
  isPathAllowed: (path:string) => Promise<boolean>;
  /**
   * This middleware gets a request and decides which response to return according to the
   * isPathAllowed and middlewareReject functions.
   * Add this middleware to the rest of your next middlewares.
   * @param request
   * @param response
   */
  guardMiddleware: (request: NextRequest, response: NextResponse) => Promise<any>;
}

/**
 * This function gets the setup of the guarded routes and returns an object with isPathAllowed and
 * @param {GenerateGuardedRoutesParams<TGuardedRoutes>} params - The parameters for generating guarded routes.
 * @returns {GeneratedGuardedRoutesReturnType}
 */
export const generateGuardedRoutes = <TGuardedRoutes extends BaseGuardedRoutes>({
  isPathAllowedWithGetApplicationGuardedRoutes,
  initValue,
  applicationGuardedRoutes,
  middlewareReject
}: GenerateGuardedRoutesParams<TGuardedRoutes>) => {
  let mergedApplicationGuardedRoutes: TGuardedRoutes | undefined;

  const getApplicationGuardedRoutes = () => {
    if (mergedApplicationGuardedRoutes) return mergedApplicationGuardedRoutes;
    mergedApplicationGuardedRoutes = applicationGuardedRoutes.reduce(
      //eslint-disable-next-line
      (acc: any, curr: any) => {
        for (const key in curr) {
          if (Array.isArray(acc[key])) {
            acc[key] = [...acc[key], ...curr[key]];
          } else if (curr[key]) {
            acc[key] = {...acc[key], ...curr[key]};
          }
        }
        return acc as TGuardedRoutes;
      },
      initValue
    );
    return mergedApplicationGuardedRoutes;
  };

  const isPathAllowed = (path: string) =>
     isPathAllowedWithGetApplicationGuardedRoutes(getApplicationGuardedRoutes)(path);

  const guardMiddleware = async (
    request: NextRequest,
    response: NextResponse
  ) => {
    const { pathname } = request.nextUrl;

    try {
      if (await isPathAllowed(pathname)) return response;
    } catch (e) {
      console.error('failed on guard', e);
    }
    return middlewareReject(getApplicationGuardedRoutes)(request.nextUrl);
  };

  return {
    guardMiddleware,
    isPathAllowed
  }
}


