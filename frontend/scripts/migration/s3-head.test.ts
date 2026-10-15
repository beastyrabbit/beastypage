// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeS3Path, signV4 } from "./s3-head";

describe("SigV4 signing", () => {
  // "Example: GET Object" from the AWS Signature Version 4 documentation.
  it("matches the AWS reference signature", () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const authorization = signV4(
      "GET",
      url,
      {
        host: "examplebucket.s3.amazonaws.com",
        range: "bytes=0-9",
        "x-amz-content-sha256":
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "x-amz-date": "20130524T000000Z",
      },
      {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
      },
      new Date("2013-05-24T00:00:00Z"),
    );
    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("encodes key segments but keeps slashes", () => {
    expect(encodeS3Path("/bucket/derivatives/a b(1).webp")).toBe(
      "/bucket/derivatives/a%20b%281%29.webp",
    );
  });
});
