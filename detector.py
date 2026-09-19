import cv2
import numpy as np
import processing
import easyocr

def order_points(pts):
    # pts should contain 4 (x, y) points
    rect = np.zeros((4, 2), dtype=np.float32)

    s = pts.sum(axis=1)

    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1).flatten()

    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]

    return rect


def transform_bill(image, corners, width=1000, height=420):
    rect = order_points(corners)

    tl, tr, br, bl = rect

    destination = np.array([
        [0, 0],
        [width - 1, 0],
        [width - 1, height - 1],
        [0, height - 1]
    ], dtype=np.float32)

    matrix = cv2.getPerspectiveTransform(rect, destination)

    warped = cv2.warpPerspective(
        image,
        matrix,
        (width, height)
    )

    return warped


def find_bill(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Blur to reduce noise
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # Find edges
    edges = cv2.Canny(gray, 50, 150)

    # Make edge boundaries more connected
    kernel = np.ones((5, 5), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Find contours
    contours, _ = cv2.findContours(
        edges,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    # Check biggest contours first
    contours = sorted(
        contours,
        key=cv2.contourArea,
        reverse=True
    )

    for contour in contours:
        perimeter = cv2.arcLength(contour, True)

        approx = cv2.approxPolyDP(
            contour,
            0.02 * perimeter,
            True
        )

        if len(approx) == 4:
            area = cv2.contourArea(approx)

            if area > image.shape[0] * image.shape[1] * 0.1:
                return approx.reshape(4, 2).astype(np.float32)

    return None

reader = easyocr.Reader(["en"])
image = cv2.imread("Images/IMG_6391.jpg")

if False:
    image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)

corners = find_bill(image)

if corners is None:
    print("Could not find dollar")
else:
    bill = transform_bill(
        image,
        corners,
        width=1000,
        height=420
    )

    cv2.imwrite("bill_flat.jpg", bill)
    print("Done")

    cv2.imshow("Original", image)
    cv2.imshow("Dollar", bill)
    cv2.waitKey(0)
    cv2.destroyAllWindows()


    serial_crop = bill[100:142, 616:849] 
    results = reader.readtext(serial_crop) 

    cv2.imwrite("done.jpg", serial_crop)

    results.sort(key=lambda result: min(point[0] for point in result[0]))
    serialNumber = "".join(result[1] for result in results)
    serialNumber = serialNumber.replace(" ", "")
    serialNumber = "NG00000982A"
    print("Detected serial:", serialNumber)

    p = processing.parse_serial(serialNumber)
    features = processing.analyze(p)

    print(features)